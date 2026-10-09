import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { parse } from "yaml";
import { reportInventoryFixture } from "../helpers/automation-fixtures";
import {
  discoverReportOperations,
  reportOperationDigest,
} from "../../scripts/automation/report-operations.mjs";
import {
  planReportPreparationRequests,
  runPreparationRequestCli,
} from "../../scripts/automation/preparation-request.mjs";
import { quarantineTavernKeeperReport } from "../../scripts/security/tavernkeeper-import-state.mjs";
import { TAVERNKEEPER_SYNTHESIS_POLICY_VERSION } from "../../scripts/security/tavernkeeper-assessment-contract.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";

function fixture(narrative = false) {
  const input = reportInventoryFixture();
  const repository = "MentallyQuill/Tavernary";
  const report = input.reportIndex.reports[0];
  if (narrative) {
    input.importedReports = [
      {
        ...report,
        synthesis_policy_version: TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
      },
    ];
    input.importState = quarantineTavernKeeperReport(
      input.importState,
      report,
      TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
      "budget-exhausted",
      new Date(input.nowMs - 1000).toISOString(),
    );
    input.runs = [
      {
        id: 801,
        path: ".github/workflows/import-tavernkeeper-reports.yml",
        event: "workflow_dispatch",
        actor: { id: 2625904, type: "User" },
        head_branch: "main",
        head_sha: "d".repeat(40),
        head_repository: { full_name: repository },
        display_title: `Security: Retry narrative ${report.report_digest}`,
        created_at: new Date(input.nowMs).toISOString(),
        updated_at: new Date(input.nowMs).toISOString(),
        status: "in_progress",
        conclusion: null,
        run_attempt: 1,
      },
    ];
  }
  input.repository = repository;
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository,
    publisherActorId: 41982982,
    nowMs: input.nowMs,
    receipts: [],
    operations: discoverReportOperations(input),
    remote: {
      mainHeadSha: "d".repeat(40),
      issues: [],
      pulls: [],
      runs: input.runs ?? [],
    },
    local: {
      revision: "d".repeat(40),
      projects: [],
      sources: input.registry,
      snapshots: [],
      kits: [],
      kitSnapshots: [],
      deployments: [],
      advisoryState: [],
      metadataState: [],
      blockedUsers: { blocked: [] },
      reportIndex: input.reportIndex,
      importedReports: input.importedReports,
      importState: input.importState,
    },
  };
  return state;
}

test.each(["schedule", "workflow_dispatch"])(
  "the actual %s report request prepares facts without model reservations",
  async (eventName) => {
    const state = fixture();
    const write = vi.fn();
    expect(
      await runPreparationRequestCli({
        event: { inputs: {} },
        env: {
          GITHUB_REPOSITORY: state.repository,
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_NAME: eventName,
          GITHUB_ACTOR_ID: eventName === "schedule" ? "41898282" : "311860138",
          GITHUB_RUN_ID: "800",
          TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
          GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/import-tavernkeeper-reports.yml@refs/heads/main`,
        },
        load: async () => state,
        write,
      }),
    ).toBe(0);
    expect(JSON.parse(write.mock.calls[0][0])).toEqual([
      {
        workflow: "import-tavernkeeper-reports.yml",
        inputs: { operation_key: state.operations[0].key },
      },
    ]);
  },
);

test("owner report retries retain the authenticated request and reject non-owner narrative requests", async () => {
  const state = fixture(true);
  const digest = reportOperationDigest(state.operations[0]);
  const env = {
    GITHUB_REPOSITORY: state.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: "2625904",
    GITHUB_RUN_ID: "801",
    TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
    GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/import-tavernkeeper-reports.yml@refs/heads/main`,
  };
  const write = vi.fn();
  expect(
    await runPreparationRequestCli({
      env,
      event: { inputs: { retry_report_digest: digest } },
      load: async () => state,
      write,
    }),
  ).toBe(0);
  expect(JSON.parse(write.mock.calls[0][0])).toEqual([
    {
      workflow: "automation-writer.yml",
      inputs: { operation_key: state.operations[0].key, mode: "prepare" },
    },
  ]);
  expect(state.remote.runs).toHaveLength(1);
  for (const actor of ["311860138", String(state.publisherActorId), "123"]) {
    expect(
      await runPreparationRequestCli({
        env: { ...env, GITHUB_ACTOR_ID: actor },
        event: { inputs: { retry_report_digest: digest } },
        load: async () => state,
        write,
      }),
    ).toBe(1);
  }
  expect(() =>
    planReportPreparationRequests({ state, reportDigest: "invalid" }),
  ).toThrow();
  state.operations[0].workerRunId = 901;
  expect(
    planReportPreparationRequests({ state, reportDigest: digest }),
  ).toEqual([]);
});

test("report requests have no canonical or model credentials and obtain dispatch authority after selection", async () => {
  const source = await readFile(
    ".github/workflows/import-tavernkeeper-reports.yml",
    "utf8",
  );
  const document = parse(source);
  const request = document.jobs.import;
  expect(Object.values(request.permissions)).not.toContain("write");
  expect(request["timeout-minutes"]).toBe(15);
  expect(request.steps[0].with["persist-credentials"]).toBe(false);
  const commands = request.steps
    .map((step: { run?: string }) => step.run ?? "")
    .join("\n");
  expect(commands).not.toMatch(/git (?:add|commit|rebase|push)\b/);
  const selection = source.indexOf(
    "node scripts/automation/preparation-request.mjs",
  );
  expect(selection).toBeGreaterThan(-1);
  expect(selection).toBeLessThan(
    source.indexOf("Create fresh report dispatch token"),
  );
  expect(JSON.stringify(request)).not.toContain("UTILITY_API_KEY");
  expect(document.jobs.deploy).toBeUndefined();
  expect(document.jobs.continue).toBeUndefined();
  expect(document.jobs.prepare["timeout-minutes"]).toBe(45);
  expect(document.on.workflow_dispatch.inputs.budget_ticket).toBeDefined();
});
