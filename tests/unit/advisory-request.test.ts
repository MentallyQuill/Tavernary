import { expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import {
  planAdvisoryPreparationRequests,
  runPreparationRequestCli,
} from "../../scripts/automation/preparation-request.mjs";
import { catalogInventoryFixture } from "../helpers/automation-fixtures";
import { discoverCatalogOperations } from "../../scripts/automation/catalog-operations.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
function fixture() {
  const input = catalogInventoryFixture();
  const operations = discoverCatalogOperations(input).filter(
    (operation) => operation.identity.kind === "advisory",
  );
  return {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41982982,
    nowMs: input.nowMs,
    operations,
    receipts: [],
    remote: { mainHeadSha: "d".repeat(40), issues: [], pulls: [], runs: [] },
    local: {
      projects: input.catalog.projects,
      sources: input.catalog.sources,
      snapshots: input.evidence,
      kits: [],
      blockedUsers: { blocked: [] },
      metadataState: input.metadataState,
      advisoryState: input.advisoryState,
      deployments: [],
      revision: "d".repeat(40),
      committedAt: new Date(input.nowMs).toISOString(),
    },
  } as AutomationInventoryState;
}
test.each(["schedule", "workflow_dispatch"])(
  "the actual %s advisory request CLI uses current canonical inventory and emits only guarded writer requests",
  async (eventName) => {
    const state = fixture();
    const operationKey = state.operations[0].key;
    const projectId = state.operations[0].identity.subject.split(":")[2];
    const write = vi.fn();
    expect(
      await runPreparationRequestCli({
        env: {
          GITHUB_REPOSITORY: state.repository,
          GITHUB_REF: "refs/heads/main",
          GITHUB_ACTOR_ID: "2625904",
          GITHUB_EVENT_NAME: eventName,
          GITHUB_RUN_ID: "700",
          TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
          GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/review-catalog-policy.yml@refs/heads/main`,
        },
        event: {
          inputs: eventName === "schedule" ? {} : { project_id: projectId },
        },
        load: async () => state,
        write,
      }),
    ).toBe(0);
    expect(JSON.parse(write.mock.calls[0][0])).toEqual([
      {
        workflow: "automation-writer.yml",
        inputs: { mode: "prepare", operation_key: operationKey },
      },
    ]);
  },
);
test("a current advisory request reserves allowance through the writer and cannot prepare directly", () => {
  const state = fixture();
  const request = planAdvisoryPreparationRequests({
    state,
    projectId: state.operations[0].identity.subject.split(":")[2],
  });
  expect(request).toEqual([
    {
      workflow: "automation-writer.yml",
      inputs: { mode: "prepare", operation_key: state.operations[0].key },
    },
  ]);
  state.operations[0].stage = "validated";
  expect(planAdvisoryPreparationRequests({ state })[0].inputs.mode).toBe(
    "advisory-notice",
  );
});
test("advisory wakeups preserve saved delays, manual input and active-worker duplicate protection", () => {
  const state = fixture();
  expect(
    planAdvisoryPreparationRequests({ state, projectId: "missing-project" }),
  ).toEqual([]);
  state.operations[0].workerRunId = 900;
  expect(planAdvisoryPreparationRequests({ state })).toEqual([]);
  state.operations[0].workerRunId = null;
  state.operations[0].nextEligibleAt = new Date(
    state.nowMs + 60000,
  ).toISOString();
  expect(planAdvisoryPreparationRequests({ state })).toEqual([]);
});
test("advisory workflow entrypoints are read-only and model credentials belong only to reserved preparation", async () => {
  const source = await readFile(
    ".github/workflows/review-catalog-policy.yml",
    "utf8",
  );
  const workflow = parse(source);
  expect(source).not.toMatch(/permission-contents: write|git push|git rebase/);
  expect(
    workflow.jobs.review.steps.some((step: { run?: string }) =>
      step.run?.includes("preparation-request.mjs"),
    ),
  ).toBe(true);
  expect(JSON.stringify(workflow.jobs.review)).not.toMatch(
    /UTILITY_API_KEY|TAVERNARY_ENRICHMENT_API_KEY/,
  );
  expect(workflow.jobs.prepare["timeout-minutes"]).toBe(45);
  expect(Object.values(workflow.jobs.prepare.permissions)).not.toContain(
    "write",
  );
  const token = workflow.jobs.review.steps.find(
    (step: { id?: string }) => step.id === "publisher-token",
  );
  expect(token.with["permission-actions"]).toBe("write");
  expect(token.with["permission-contents"]).toBeUndefined();
  expect(source.match(/secrets\.UTILITY_API_KEY/g)).toHaveLength(1);
});
