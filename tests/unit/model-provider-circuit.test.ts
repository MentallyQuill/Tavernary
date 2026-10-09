import { expect, test, vi } from "vitest";
import { runModelWriterPreparation } from "../../scripts/automation/writer-runtime.mjs";
import { assessInventoryHealth } from "../../scripts/automation/health.mjs";
import {
  createModelBudgetState,
  reserveModelBudget,
  settleModelBudget,
} from "../../scripts/automation/model-budget.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import {
  operationFixture,
  receiptFixture,
} from "../helpers/automation-fixtures";

const failedAt = Date.parse("2026-10-31T22:00:00Z");
const day = 86_400_000;
const workflow = ".github/workflows/enrich-catalog.yml";

function circuitFixture() {
  const failed = operationFixture({
    identity: {
      ...operationFixture().identity,
      kind: "metadata",
      subject: "source:failed",
    },
    createdAt: new Date(failedAt - 3_600_000).toISOString(),
    nextEligibleAt: new Date(failedAt + day).toISOString(),
    retry: {
      failure: {
        kind: "configuration",
        reasonCode: "provider-authentication-failed",
      },
      transientAttempts: 0,
      immediateAttempts: 0,
    },
  });
  const due = operationFixture({
    identity: { ...failed.identity, subject: "source:due" },
    createdAt: failed.createdAt,
  });
  const other = operationFixture({
    identity: { ...failed.identity, subject: "source:other" },
    createdAt: failed.createdAt,
  });
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "Owner/Repo",
    publisherActorId: 41,
    nowMs: failedAt + 4 * 3_600_000,
    remote: { mainHeadSha: "b".repeat(40), issues: [], pulls: [], runs: [] },
    local: {
      revision: "b".repeat(40),
      modelBudget: createModelBudgetState(failedAt),
    },
    receipts: [
      receiptFixture({
        operation: failed,
        updatedAt: new Date(failedAt).toISOString(),
      }),
    ],
    operations: [failed, due, other],
  };
  const budget = () =>
    state.local.modelBudget as ReturnType<typeof createModelBudgetState>;
  const commit = vi.fn(async (input: { files: Array<{ content: string }> }) => {
    state.local.modelBudget = JSON.parse(input.files[0].content);
    return { sha: "c".repeat(40) };
  });
  const dispatch = vi.fn(async () => ({ runId: 700, workflow }));
  const persistFailure = vi.fn(async () => {});
  const run = (operationKey = due.key, runId = "800", cached = false) =>
    runModelWriterPreparation({
      operationKey,
      load: async () => state,
      commit,
      dispatch,
      persistFailure,
      metadataCached: async () => cached,
      dispatchCached: async () => ({ runId: 701, workflow }),
      env: {
        GITHUB_REPOSITORY: state.repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF:
          "Owner/Repo/.github/workflows/automation-writer.yml@refs/heads/main",
        GITHUB_RUN_ID: runId,
        GITHUB_RUN_ATTEMPT: "1",
        TAVERNARY_PUBLISHER_BOT_ID: "41",
        UTILITY_MODEL: "primary",
      },
    });
  return {
    state,
    failed,
    due,
    other,
    budget,
    commit,
    dispatch,
    persistFailure,
    run,
  };
}

test("a shared credential failure blocks another due operation across daily and monthly rollover", async () => {
  const f = circuitFixture();
  expect(await f.run()).toEqual({
    status: "waiting",
    reason: "provider-circuit-open",
  });
  expect(f.commit).not.toHaveBeenCalled();
  expect(f.dispatch).not.toHaveBeenCalled();
  expect(f.persistFailure).not.toHaveBeenCalled();
  expect(f.budget().tickets).toHaveLength(0);
});

function completedDispatchHandoff(f: ReturnType<typeof circuitFixture>) {
  const run = {
    id: 600,
    path: ".github/workflows/automation-worker.yml",
    event: "workflow_dispatch",
    display_title: `Automation ${f.due.key}`,
    head_branch: "main",
    head_sha: String(f.state.local.revision),
    head_repository: { full_name: f.state.repository },
    actor: { id: f.state.publisherActorId, type: "Bot" },
    status: "completed",
    conclusion: "success",
    created_at: new Date(f.state.nowMs - 120_000).toISOString(),
    updated_at: new Date(f.state.nowMs - 60_000).toISOString(),
  };
  f.due.workerRunId = run.id;
  f.state.remote.runs.push(run);
  return run;
}

test("a successful dispatch wrapper hands preparation to the writer without bypassing the provider circuit", async () => {
  const f = circuitFixture();
  completedDispatchHandoff(f);
  expect(await f.run()).toEqual({
    status: "waiting",
    reason: "provider-circuit-open",
  });
  expect(f.commit).not.toHaveBeenCalled();
  expect(f.dispatch).not.toHaveBeenCalled();
});

test("a completed dispatch handoff permits one budgeted model preparation", async () => {
  const f = circuitFixture();
  f.state.nowMs = failedAt + day;
  completedDispatchHandoff(f);
  expect((await f.run()).status).toBe("dispatched");
  expect(f.commit).toHaveBeenCalledTimes(2);
  expect(f.dispatch).toHaveBeenCalledOnce();
  expect(f.budget().tickets[0].producer).toEqual({ runId: 700, workflow });
});

test.each([
  "active",
  "failed",
  "producer",
  "foreign-actor",
  "foreign-repository",
  "wrong-key",
  "future-clock",
] as const)(
  "%s worker proof cannot acknowledge the dispatch handoff",
  async (variant) => {
    const f = circuitFixture();
    f.state.nowMs = failedAt + day;
    const run = completedDispatchHandoff(f);
    if (variant === "active") run.status = "in_progress";
    if (variant === "failed") run.conclusion = "failure";
    if (variant === "producer") run.path = workflow;
    if (variant === "foreign-actor") run.actor.id++;
    if (variant === "foreign-repository")
      run.head_repository.full_name = "Other/Repo";
    if (variant === "wrong-key")
      run.display_title = `Automation ${f.other.key}`;
    if (variant === "future-clock")
      run.updated_at = new Date(f.state.nowMs + day).toISOString();
    expect(await f.run()).toEqual({ status: "superseded" });
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
  },
);

test("one due probe binds its own envelope and excludes other jobs even after expiry and midnight", async () => {
  const f = circuitFixture();
  f.state.nowMs = failedAt + day;
  expect((await f.run()).status).toBe("dispatched");
  expect(f.commit).toHaveBeenCalledTimes(2);
  expect(f.budget().tickets[0].producer).toEqual({ runId: 700, workflow });
  f.state.nowMs += 4 * 3_600_000;
  expect(await f.run(f.other.key, "801")).toEqual({
    status: "waiting",
    reason: "provider-circuit-open",
  });
  expect(f.dispatch).toHaveBeenCalledOnce();
  expect(f.budget().tickets).toHaveLength(1);
});

test("an unconfirmed probe dispatch remains charged and closes the window to replacement envelopes", async () => {
  const f = circuitFixture();
  f.state.nowMs = failedAt + day;
  f.dispatch.mockRejectedValueOnce(new Error("dispatch response lost"));
  await expect(f.run()).rejects.toThrow("dispatch response lost");
  expect(f.budget().tickets[0].producer).toBeNull();
  f.state.nowMs += 4 * 3_600_000;
  expect(await f.run(f.due.key, "802")).toEqual({
    status: "waiting",
    reason: "provider-circuit-open",
  });
  expect(f.dispatch).toHaveBeenCalledOnce();
});

test("a positive settled response clears preparation and the stale health circuit", async () => {
  const f = circuitFixture();
  f.state.nowMs = failedAt + day;
  await f.run();
  const ticket = f.budget().tickets[0];
  f.state.local.modelBudget = settleModelBudget(f.budget(), ticket, {
    requests: 1,
    tokens: 1000,
  });
  f.state.nowMs += 4 * 3_600_000;
  expect(
    assessInventoryHealth(f.state).find(
      (value) => value.code === "provider-circuit",
    ),
  ).toMatchObject({
    subject: "dependency:model-provider",
    status: "recovered",
  });
  expect((await f.run(f.other.key, "801")).status).toBe("dispatched");
  expect(f.dispatch).toHaveBeenCalledTimes(2);
});

test("settlement without a successful request cannot clear the circuit", async () => {
  const f = circuitFixture();
  f.state.nowMs = failedAt + day;
  await f.run();
  f.state.local.modelBudget = settleModelBudget(
    f.budget(),
    f.budget().tickets[0],
    { requests: 0, tokens: 0 },
  );
  f.state.nowMs += 4 * 3_600_000;
  expect(await f.run(f.other.key, "801")).toEqual({
    status: "waiting",
    reason: "provider-circuit-open",
  });
});

test("a later failure invalidates earlier successful provider evidence", async () => {
  const f = circuitFixture();
  f.state.nowMs = failedAt + day;
  await f.run();
  f.state.local.modelBudget = settleModelBudget(
    f.budget(),
    f.budget().tickets[0],
    { requests: 1, tokens: 1000 },
  );
  const later = f.state.nowMs + 60_000;
  f.failed.nextEligibleAt = new Date(later + day).toISOString();
  f.state.receipts[0].updatedAt = new Date(later).toISOString();
  f.state.nowMs = later + 60_000;
  expect(await f.run(f.other.key, "801")).toEqual({
    status: "waiting",
    reason: "provider-circuit-open",
  });
  expect(
    assessInventoryHealth(f.state).find(
      (value) => value.code === "provider-circuit",
    ),
  ).toMatchObject({ status: "active" });
});

test("future-dated success and unrelated model usage cannot clear the known failure", async () => {
  for (const [model, createdAt] of [
    ["primary", failedAt + 2 * day],
    ["unrelated", failedAt + 60_000],
  ] as const) {
    const f = circuitFixture();
    const reservation = reserveModelBudget(
      f.budget(),
      {
        operationKey: f.other.key,
        requestId: "proof",
        model,
        requestCount: 1,
        requestedTokens: 1000,
      },
      { nowMs: createdAt },
    );
    if (!reservation.allowed) throw new Error("Fixture reservation failed");
    f.state.local.modelBudget = settleModelBudget(
      reservation.state,
      reservation.ticket,
      { requests: 1, tokens: 1000 },
    );
    expect(await f.run()).toEqual({
      status: "waiting",
      reason: "provider-circuit-open",
    });
  }
});

test("receipt failure evidence still applies when its operation no longer appears in the current queue", async () => {
  const f = circuitFixture();
  f.state.operations = [f.due, f.other];
  expect(await f.run()).toEqual({
    status: "waiting",
    reason: "provider-circuit-open",
  });
});

test("provider-free cached work and publisher credential failures do not spend or block model probes", async () => {
  const f = circuitFixture();
  expect((await f.run(f.due.key, "800", true)).status).toBe("cache-dispatched");
  expect(f.commit).not.toHaveBeenCalled();
  f.failed.retry!.failure.reasonCode = "publisher-authentication-failed";
  expect((await f.run()).status).toBe("dispatched");
});

test("a still-broken provider permits only one new probe after the full shared retry window", async () => {
  const f = circuitFixture();
  f.state.nowMs = failedAt + day;
  await f.run();
  f.state.nowMs += day;
  expect((await f.run(f.other.key, "801")).status).toBe("dispatched");
  expect(f.dispatch).toHaveBeenCalledTimes(2);
});
