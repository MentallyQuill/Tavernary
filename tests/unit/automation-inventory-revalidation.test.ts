import { expect, test } from "vitest";
import {
  discoverAutomationState,
  dispatchAutomationOperation,
  revalidateAutomationOperation,
} from "../../scripts/automation/inventory.mjs";
import { reconcileAutomation } from "../../scripts/automation/reconcile.mjs";
import { createEnrichmentRunState } from "../../scripts/catalog/enrichment-run-state.mjs";
import { createEnrichmentReport } from "../../scripts/catalog/enrichment-report.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import {
  AUTOMATION_NOW,
  catalogInventoryFixture,
} from "../helpers/automation-fixtures";

function inventoryState(): AutomationInventoryState {
  const input = catalogInventoryFixture();
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41_982_982,
    nowMs: AUTOMATION_NOW,
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: "d".repeat(40) },
    receipts: [],
    local: {
      projects: input.catalog.projects,
      sources: input.catalog.sources,
      snapshots: input.evidence,
      metadataState: [],
      advisoryState: [],
      deployments: [],
      kits: [],
      blockedUsers: { blocked: [] },
      revision: "d".repeat(40),
    },
    operations: [],
  };
  state.operations = discoverAutomationState(state);
  return state;
}

test("candidate revalidation reads only workers created since the shared inventory snapshot", async () => {
  const state = inventoryState();
  const candidates = state.operations.slice(0, 3);
  expect(candidates).toHaveLength(3);
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    const page = Number(args.find((arg) => arg.startsWith("page="))!.slice(5));
    const lower = args.find((arg) => arg.startsWith("created=>="))!;
    if (lower === "created=>=2026-10-07T11:59:59.000Z")
      return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
    return JSON.stringify([
      {
        total_count: 901,
        workflow_runs: Array.from(
          { length: page === 10 ? 1 : 100 },
          (_, index) => ({
            id: (page - 1) * 100 + index + 1,
            status: "completed",
            conclusion: "success",
          }),
        ),
      },
    ]);
  };
  for (const operation of candidates) {
    const current = await revalidateAutomationOperation({
      state,
      operation,
      gh,
      repository: state.repository,
      nowMs: AUTOMATION_NOW + 60_000,
    });
    expect(current?.key).toBe(operation.key);
  }
  expect(calls).toHaveLength(3);
  expect(
    calls.every((args) => args.includes("created=>=2026-10-07T11:59:59.000Z")),
  ).toBe(true);
});

function worker(operationKey: string, prepare = false) {
  return {
    id: 700,
    path: prepare
      ? ".github/workflows/refresh-catalog.yml"
      : ".github/workflows/automation-worker.yml",
    event: "workflow_dispatch",
    display_title: `Automation ${prepare ? "prepare " : ""}${operationKey}`,
    head_branch: "main",
    head_sha: "b".repeat(40),
    head_repository: { full_name: "MentallyQuill/Tavernary" },
    actor: { id: 41_982_982, type: "Bot" },
    status: "completed",
    conclusion: "failure",
    created_at: "2026-10-07T11:55:00.000Z",
    updated_at: "2026-10-07T11:56:00.000Z",
  };
}

test.each([false, true])(
  "revalidation refreshes a known worker that became active before its delta window (prepare: %s)",
  async (prepare) => {
    const state = inventoryState();
    const operation = state.operations.find(
      (value) => value.identity.subject === "source:github-42",
    )!;
    const previous = worker(operation.key, prepare);
    state.remote.runs = [previous];
    const current = await revalidateAutomationOperation({
      state,
      operation,
      repository: state.repository,
      nowMs: AUTOMATION_NOW,
      gh: async (args) => {
        const path = args.find((arg) => arg.startsWith("repos/"))!;
        if (path.endsWith("/actions/runs/700"))
          return JSON.stringify({
            ...previous,
            status: "queued",
            conclusion: null,
          });
        if (path.endsWith("/actions/workflows/automation-worker.yml/runs"))
          return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
        throw new Error(`Unexpected route ${path}`);
      },
    });
    expect(current?.workerRunId).toBe(700);
  },
);

test("dispatch leaves a durable lease while the new worker is not yet visible", async () => {
  const state = inventoryState();
  const operation = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  let dispatches = 0;
  let visible = false;
  const gh = async (args: string[]) => {
    if (args[0] === "workflow") {
      dispatches++;
      return "";
    }
    if (!visible)
      throw new Error(
        "Worker visibility is delayed; dispatch must not scan history.",
      );
    return JSON.stringify([
      {
        total_count: 1,
        workflow_runs: [
          {
            ...worker(operation.key),
            status: "queued",
            conclusion: null,
            created_at: "2026-10-07T12:00:10.000Z",
          },
        ],
      },
    ]);
  };
  const input = {
    inventory: async () =>
      discoverAutomationState(state).filter(
        (value) => value.key === operation.key,
      ),
    persist: async (receipt: AutomationInventoryState["receipts"][number]) => {
      state.receipts = [structuredClone(receipt)];
    },
    dispatch: (candidate: typeof operation) =>
      dispatchAutomationOperation({
        operation: candidate,
        gh,
        repository: state.repository,
        env: { TAVERNARY_PUBLISHER_BOT_ID: "41982982" },
      }),
    nowMs: AUTOMATION_NOW,
  };
  expect((await reconcileAutomation(input)).dispatched).toBe(1);
  expect(state.receipts[0].operation.workerRunId).toBeNull();
  expect(state.receipts[0].operation.nextEligibleAt).toBe(
    "2026-10-07T12:15:00.000Z",
  );
  expect((await reconcileAutomation(input)).dispatched).toBe(0);
  expect(dispatches).toBe(1);
  visible = true;
  expect(
    (
      await revalidateAutomationOperation({
        state,
        operation,
        gh,
        repository: state.repository,
        nowMs: AUTOMATION_NOW + 20_000,
      })
    )?.workerRunId,
  ).toBe(700);
});

test("exact worker refresh retains diagnostics only for the same attempt and source", async () => {
  for (const changed of ["none", "attempt", "source"]) {
    const state = inventoryState();
    const operation = state.operations.find(
      (value) => value.identity.subject === "source:github-42",
    )!;
    const previous = {
      ...worker(operation.key),
      run_attempt: 1,
      automationDiagnostic: {
        schema_version: 1 as const,
        operation_key: operation.key,
        failure: {
          kind: "transient" as const,
          reasonCode: "provider-rate-limited" as const,
        },
        runId: 700,
        runAttempt: 1,
        sourceSha: "b".repeat(40),
      },
    };
    state.remote.runs = [previous];
    await revalidateAutomationOperation({
      state,
      operation,
      repository: state.repository,
      nowMs: AUTOMATION_NOW,
      gh: async (args) => {
        const path = args.find((arg) => arg.startsWith("repos/"))!;
        if (path.endsWith("/actions/runs/700")) {
          const { automationDiagnostic: _diagnostic, ...native } = previous;
          return JSON.stringify({
            ...native,
            run_attempt: changed === "attempt" ? 2 : 1,
            head_sha: (changed === "source" ? "c" : "b").repeat(40),
          });
        }
        return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
      },
    });
    const refreshed = state.remote.runs[0] as typeof previous;
    expect(refreshed.automationDiagnostic).toEqual(
      changed === "none" ? previous.automationDiagnostic : undefined,
    );
  }
});

test("revalidation refreshes a trusted writer handoff rerun outside the worker delta", async () => {
  const state = inventoryState();
  const operation = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  const previous = {
    ...worker(operation.key),
    path: ".github/workflows/automation-writer.yml",
    display_title: `Automation write prepare ${operation.key}`,
  };
  state.remote.runs = [previous];
  const current = await revalidateAutomationOperation({
    state,
    operation,
    repository: state.repository,
    nowMs: AUTOMATION_NOW,
    gh: async (args) => {
      const path = args.find((arg) => arg.startsWith("repos/"))!;
      if (path.endsWith("/actions/runs/700"))
        return JSON.stringify({
          ...previous,
          status: "queued",
          conclusion: null,
        });
      if (path.endsWith("/actions/workflows/automation-worker.yml/runs"))
        return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
      throw new Error(`Unexpected route ${path}`);
    },
  });
  expect(current?.workerRunId).toBe(700);
});

test("a worker appearing between candidates is discovered before a second dispatch", async () => {
  const state = inventoryState();
  const first = state.operations.find(
    (value) => value.identity.subject === "source:catalog-maintenance",
  )!;
  const second = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  let reads = 0;
  const gh = async () =>
    JSON.stringify([
      {
        total_count: ++reads === 1 ? 0 : 1,
        workflow_runs:
          reads === 1
            ? []
            : [
                {
                  ...worker(second.key),
                  status: "queued",
                  conclusion: null,
                  created_at: "2026-10-07T12:00:10.000Z",
                },
              ],
      },
    ]);
  expect(
    (
      await revalidateAutomationOperation({
        state,
        operation: first,
        gh,
        repository: state.repository,
        nowMs: AUTOMATION_NOW,
      })
    )?.workerRunId,
  ).toBeNull();
  expect(
    (
      await revalidateAutomationOperation({
        state,
        operation: second,
        gh,
        repository: state.repository,
        nowMs: AUTOMATION_NOW + 20_000,
      })
    )?.workerRunId,
  ).toBe(700);
});

test("a truncated worker delta still refuses revalidation", async () => {
  const state = inventoryState();
  await expect(
    revalidateAutomationOperation({
      state,
      operation: state.operations[0],
      repository: state.repository,
      nowMs: AUTOMATION_NOW,
      gh: async () =>
        JSON.stringify([{ total_count: 1001, workflow_runs: [] }]),
    }),
  ).rejects.toThrow(/cap/u);
});

test("a foreign preparation title cannot hide the trusted worker refresh", async () => {
  const state = inventoryState();
  const operation = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  const trusted = worker(operation.key, true);
  const foreign = { ...trusted, id: 701, actor: { id: 1, type: "User" } };
  state.remote.runs = [trusted, foreign];
  const current = await revalidateAutomationOperation({
    state,
    operation,
    repository: state.repository,
    nowMs: AUTOMATION_NOW,
    gh: async (args) => {
      const path = args.find((arg) => arg.startsWith("repos/"))!;
      if (path.endsWith("/actions/runs/700"))
        return JSON.stringify({
          ...trusted,
          status: "queued",
          conclusion: null,
        });
      if (path.endsWith("/actions/runs/701")) return JSON.stringify(foreign);
      return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
    },
  });
  expect(current?.workerRunId).toBe(700);
});

test("inventory carries the authenticated executing writer exclusion without hiding another writer", () => {
  const state = inventoryState();
  const operation = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  state.remote.runs = [
    {
      ...worker(operation.key),
      path: ".github/workflows/automation-writer.yml",
      display_title: `Automation write prepare ${operation.key}`,
      status: "in_progress",
      conclusion: null,
    },
  ];
  state.executingWriterRunId = 700;
  expect(
    discoverAutomationState(state).find((value) => value.key === operation.key)
      ?.workerRunId,
  ).toBeNull();
  state.executingWriterRunId = 701;
  expect(
    discoverAutomationState(state).find((value) => value.key === operation.key)
      ?.workerRunId,
  ).toBe(700);
});

test("enrichment discovery carries the current writer exclusion", () => {
  const state = inventoryState();
  state.local.enrichmentCanary = createEnrichmentReport(
    createEnrichmentRunState({
      mode: "canary",
      runId: "inventory-canary",
      manifest: [
        "example-project",
        "fixture-b",
        "fixture-c",
        "fixture-d",
        "fixture-e",
      ],
      batchSize: 1,
      concurrency: 1,
      model: "fixture-model",
      now: "2026-10-07T12:00:00.000Z",
      selectionMode: "all-automatic",
    }),
  );
  const operation = discoverAutomationState(state).find(
    (value) => value.identity.kind === "enrichment",
  )!;
  expect(operation).toBeDefined();
  state.remote.runs = [
    {
      ...worker(operation.key),
      path: ".github/workflows/automation-writer.yml",
      display_title: `Automation write prepare ${operation.key}`,
      status: "in_progress",
      conclusion: null,
      created_at: "2026-10-07T12:00:00.000Z",
    },
  ];
  state.executingWriterRunId = 700;
  expect(
    discoverAutomationState(state).find((value) => value.key === operation.key)
      ?.workerRunId,
  ).toBeNull();
});
