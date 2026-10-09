import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { parse } from "yaml";
import { catalogInventoryFixture } from "../helpers/automation-fixtures";
import { discoverAutomationState } from "../../scripts/automation/inventory.mjs";
import { classifyAutomationFailure } from "../../scripts/automation/failure.mjs";
import {
  planRefreshPreparationRequests,
  runPreparationRequestCli,
} from "../../scripts/automation/preparation-request.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";

function fixture() {
  const input = catalogInventoryFixture();
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41982982,
    nowMs: input.nowMs,
    operations: [],
    receipts: [],
    local: {
      projects: input.catalog.projects,
      sources: input.catalog.sources,
      snapshots: input.evidence,
      kits: [],
      kitSnapshots: [],
      blockedUsers: { blocked: [] },
      advisoryState: [],
      metadataState: [],
      deployments: [],
      refreshManifest: { completed_at: new Date(input.nowMs).toISOString() },
      revision: "d".repeat(40),
      committedAt: new Date(input.nowMs).toISOString(),
    },
    remote: { mainHeadSha: "d".repeat(40), issues: [], pulls: [], runs: [] },
  };
  state.operations = discoverAutomationState(state);
  return state;
}

test.each(["schedule", "workflow_dispatch"])(
  "the actual %s refresh request emits pinned source preparation",
  async (eventName) => {
    const state = fixture();
    const key = state.operations.find(
      (operation) => operation.identity.subject === "source:github-42",
    )!.key;
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
          GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/refresh-catalog.yml@refs/heads/main`,
        },
        event: {
          inputs:
            eventName === "schedule"
              ? {}
              : { mode: "forensic", source_id: "github-42" },
        },
        load: async () => state,
        write,
      }),
    ).toBe(0);
    expect(JSON.parse(write.mock.calls[0][0])).toEqual([
      {
        workflow: "refresh-catalog.yml",
        inputs: {
          mode: eventName === "schedule" ? "project" : "forensic",
          source_id: "github-42",
          operation_key: key,
        },
      },
    ]);
  },
);

test("owner source requests may refresh before daily cadence without bypassing current workers or permanent rejection", () => {
  const state = fixture();
  const operation = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  operation.nextEligibleAt = new Date(state.nowMs + 60000).toISOString();
  expect(planRefreshPreparationRequests({ state })).toEqual([]);
  expect(
    planRefreshPreparationRequests({
      state,
      mode: "forensic",
      sourceId: "github-42",
    }),
  ).toHaveLength(1);
  operation.workerRunId = 701;
  expect(
    planRefreshPreparationRequests({
      state,
      mode: "forensic",
      sourceId: "github-42",
    }),
  ).toEqual([]);
  operation.workerRunId = null;
  operation.retry = {
    failure: classifyAutomationFailure({ diagnosticCode: "validation-failed" }),
    immediateAttempts: 1,
    transientAttempts: 0,
  };
  expect(
    planRefreshPreparationRequests({
      state,
      mode: "forensic",
      sourceId: "github-42",
    }),
  ).toEqual([]);
  expect(() =>
    planRefreshPreparationRequests({ state, mode: "forensic" }),
  ).toThrow();
  expect(() =>
    planRefreshPreparationRequests({ state, mode: "baseline", batchSize: 25 }),
  ).toThrow();
});

test("a completed trusted explicit preparation makes the refreshed source eligible for publication", () => {
  const state = fixture();
  (state.local.snapshots as Array<{ refreshed_at: string }>)[0].refreshed_at =
    new Date(state.nowMs).toISOString();
  state.operations = discoverAutomationState(state);
  const operation = state.operations.find(
    (value) => value.identity.kind === "refresh",
  )!;
  expect(Date.parse(operation.nextEligibleAt!)).toBeGreaterThan(state.nowMs);
  state.remote.runs = [
    {
      id: 701,
      path: ".github/workflows/refresh-catalog.yml",
      event: "workflow_dispatch",
      head_branch: "main",
      head_sha: "d".repeat(40),
      head_repository: { full_name: state.repository },
      actor: { id: state.publisherActorId, type: "Bot" },
      display_title: `Automation prepare ${operation.key}`,
      status: "completed",
      conclusion: "success",
      created_at: new Date(state.nowMs).toISOString(),
      updated_at: new Date(state.nowMs + 1000).toISOString(),
    },
  ];
  state.operations = discoverAutomationState(state);
  expect(
    state.operations.find((value) => value.key === operation.key)
      ?.nextEligibleAt,
  ).toBeNull();
});

test("refresh entrypoint only requests preparation and leaves main publication to the serialized writer", async () => {
  const source = await readFile(
    ".github/workflows/refresh-catalog.yml",
    "utf8",
  );
  const workflow = parse(source);
  expect(source).not.toMatch(
    /permission-contents: write|git push|git rebase|workflow run deploy-pages/,
  );
  expect(workflow.jobs.refresh["timeout-minutes"]).toBe(15);
  expect(Object.values(workflow.jobs.refresh.permissions)).not.toContain(
    "write",
  );
  const steps = workflow.jobs.refresh.steps as Array<{
    id?: string;
    run?: string;
    with?: Record<string, unknown>;
  }>;
  const request = steps.findIndex((step) =>
    step.run?.includes("preparation-request.mjs"),
  );
  const token = steps.findIndex((step) => step.id === "publisher-token");
  expect(request).toBeGreaterThan(-1);
  expect(token).toBeGreaterThan(request);
  expect(steps[token].with?.["permission-actions"]).toBe("write");
  expect(workflow.concurrency.group).toContain("inputs.operation_key");
  expect(workflow.jobs.prepare["timeout-minutes"]).toBe(45);
});
