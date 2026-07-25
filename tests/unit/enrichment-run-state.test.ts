import { expect, test } from "vitest";

import {
  applyAttemptResults,
  approveCanaryDeployment,
  assertFullRolloutAllowed,
  createEnrichmentRunState,
  selectNextRunBatch,
} from "../../scripts/catalog/enrichment-run-state.mjs";

const now = "2026-07-24T00:00:00.000Z";
const later = "2026-07-24T00:01:00.000Z";

function ids(count: number, offset = 0) {
  return Array.from(
    { length: count },
    (_, index) => `project-${String(index + offset).padStart(3, "0")}`,
  );
}

function results(
  projectIds: string[],
  phase: "primary" | "retry",
  outcome: "enriched" | "fallback" | "failed" = "enriched",
) {
  return projectIds.map((id) => ({ id, phase, outcome }));
}

test("attempts every frozen manifest ID after earlier records complete", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ids(60).reverse(),
    runId: "run-1",
    now,
    batchSize: 20,
  });
  expect(selectNextRunBatch(state)).toEqual({
    phase: "primary",
    projectIds: ids(20),
    attempt: 1,
  });

  const original = structuredClone(state);
  state = applyAttemptResults(state, results(ids(20), "primary"), later);

  expect(original.primary_cursor).toBe(0);
  expect(state.manifest).toEqual(ids(60));
  expect(selectNextRunBatch(state).projectIds).toEqual(ids(20, 20));
});

test("deduplicates and sorts a full manifest without mutating input", () => {
  const manifest = ["z", "a", "z", "b"];
  const state = createEnrichmentRunState({
    mode: "full",
    manifest,
    runId: "run-1",
    now,
  });

  expect(manifest).toEqual(["z", "a", "z", "b"]);
  expect(state.manifest).toEqual(["a", "b", "z"]);
  expect(() => (state.manifest as string[]).push("later")).toThrow();
});

test("queues primary failures once and retries only after primary completion", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a", "b", "c"],
    runId: "run-1",
    now,
    batchSize: 2,
  });
  state = applyAttemptResults(
    state,
    [
      { id: "a", phase: "primary", outcome: "failed" },
      { id: "b", phase: "primary", outcome: "enriched" },
    ],
    later,
  );
  expect(state.retry_queue).toEqual(["a"]);
  expect(state.entries.a.outcome).toBe("retry-pending");
  expect(selectNextRunBatch(state)).toEqual({
    phase: "primary",
    projectIds: ["c"],
    attempt: 1,
  });

  state = applyAttemptResults(
    state,
    [{ id: "c", phase: "primary", outcome: "failed" }],
    later,
  );
  expect(state.retry_queue).toEqual(["a", "c"]);
  expect(selectNextRunBatch(state)).toEqual({
    phase: "retry",
    projectIds: ["a", "c"],
    attempt: 2,
  });
});

test("maps retry outcomes, recomputes aggregates, and completes with failures", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a", "b"],
    runId: "run-1",
    now,
  });
  state = applyAttemptResults(
    state,
    results(["a", "b"], "primary", "failed"),
    later,
  );
  state = applyAttemptResults(
    state,
    [
      { id: "a", phase: "retry", outcome: "enriched" },
      { id: "b", phase: "retry", outcome: "failed" },
    ],
    later,
  );

  expect(state).toMatchObject({
    status: "complete",
    phase: "complete",
    attempts: { a: 2, b: 2 },
    aggregates: {
      "retry-enriched": 1,
      "final-failure": 1,
    },
  });
  expect(selectNextRunBatch(state).projectIds).toEqual([]);
});

test("resumes from serialized cursor and never repeats completed IDs", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ids(45),
    runId: "run-1",
    now,
    batchSize: 20,
  });
  state = applyAttemptResults(state, results(ids(20), "primary"), later);
  const resumed = JSON.parse(JSON.stringify(state));

  expect(selectNextRunBatch(resumed).projectIds).toEqual(ids(20, 20));
});

test("requires exactly five unique canary IDs", () => {
  expect(() =>
    createEnrichmentRunState({
      mode: "canary",
      manifest: ["a", "b", "c", "d"],
      runId: "canary",
      now,
    }),
  ).toThrow("five unique");
  expect(() =>
    createEnrichmentRunState({
      mode: "canary",
      manifest: ["a", "b", "c", "d", "d"],
      runId: "canary",
      now,
    }),
  ).toThrow("five unique");
});

test("requires verified deployment before a successful canary authorizes full rollout", () => {
  const manifest = ["a", "b", "c", "d", "e"];
  let awaitingDeployment = createEnrichmentRunState({
    mode: "canary",
    manifest,
    runId: "canary-pass",
    now,
  });
  awaitingDeployment = applyAttemptResults(
    awaitingDeployment,
    results(manifest, "primary"),
    later,
  );
  expect(awaitingDeployment).toMatchObject({
    status: "awaiting-deployment",
    phase: "complete",
    deployment: null,
  });
  expect(() => assertFullRolloutAllowed(awaitingDeployment)).toThrow(
    "deployed canary",
  );

  const passed = approveCanaryDeployment(awaitingDeployment, {
    commitSha: "b".repeat(40),
    deploymentRunId: 12345,
    now: "2026-07-24T00:02:00.000Z",
  });
  expect(passed).toMatchObject({
    status: "passed",
    deployment: {
      commit_sha: "b".repeat(40),
      run_id: 12345,
      verified_at: "2026-07-24T00:02:00.000Z",
    },
  });
  expect(() => assertFullRolloutAllowed(passed)).not.toThrow();

  let failed = createEnrichmentRunState({
    mode: "canary",
    manifest,
    runId: "canary-fail",
    now,
  });
  failed = applyAttemptResults(
    failed,
    [
      ...results(manifest.slice(0, 4), "primary"),
      { id: "e", phase: "primary", outcome: "failed" },
    ],
    later,
  );
  expect(failed.phase).toBe("retry");
  failed = applyAttemptResults(
    failed,
    [{ id: "e", phase: "retry", outcome: "failed" }],
    later,
  );
  expect(failed).toMatchObject({ status: "failed", phase: "complete" });
  expect(() => assertFullRolloutAllowed(failed)).toThrow("deployed canary");
});

test("rejects invalid or premature canary deployment approval", () => {
  const running = createEnrichmentRunState({
    mode: "canary",
    manifest: ["a", "b", "c", "d", "e"],
    runId: "canary",
    now,
  });
  expect(() =>
    approveCanaryDeployment(running, {
      commitSha: "b".repeat(40),
      deploymentRunId: 12345,
      now: later,
    }),
  ).toThrow("awaiting deployment");

  const awaiting = applyAttemptResults(
    running,
    results(["a", "b", "c", "d", "e"], "primary"),
    later,
  );
  expect(() =>
    approveCanaryDeployment(awaiting, {
      commitSha: "not-a-sha",
      deploymentRunId: 12345,
      now: later,
    }),
  ).toThrow("commit SHA");
  expect(() =>
    approveCanaryDeployment(awaiting, {
      commitSha: "b".repeat(40),
      deploymentRunId: 0,
      now: later,
    }),
  ).toThrow("deployment run ID");
});

test("source-not-ready blocks a canary without consuming a retry", () => {
  const manifest = ["a", "b", "c", "d", "e"];
  let state = createEnrichmentRunState({
    mode: "canary",
    manifest,
    runId: "canary",
    now,
  });
  state = applyAttemptResults(
    state,
    [
      ...results(manifest.slice(0, 4), "primary"),
      { id: "e", phase: "primary", outcome: "source-not-ready" },
    ],
    later,
  );

  expect(state).toMatchObject({
    status: "failed",
    phase: "complete",
    retry_queue: [],
    attempts: { a: 1, b: 1, c: 1, d: 1, e: 1 },
  });
});

test("rejects out-of-order, duplicate, or over-limit attempt results", () => {
  const state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a", "b"],
    runId: "run-1",
    now,
  });

  expect(() =>
    applyAttemptResults(
      state,
      [{ id: "b", phase: "primary", outcome: "enriched" }],
      later,
    ),
  ).toThrow("expected IDs");
  expect(() =>
    applyAttemptResults(
      state,
      [
        { id: "a", phase: "primary", outcome: "enriched" },
        { id: "a", phase: "primary", outcome: "enriched" },
      ],
      later,
    ),
  ).toThrow("duplicate");
});

test("simulates 206 cards with exactly one primary and one failed-only retry", () => {
  const manifest = ids(206);
  const failedIds = new Set(["project-002", "project-101", "project-205"]);
  let state = createEnrichmentRunState({
    mode: "full",
    manifest,
    runId: "run-206",
    now,
    batchSize: 20,
  });
  const primarySeen: string[] = [];

  while (state.phase === "primary") {
    const batch = selectNextRunBatch(state);
    primarySeen.push(...batch.projectIds);
    state = applyAttemptResults(
      state,
      batch.projectIds.map((id) => ({
        id,
        phase: "primary" as const,
        outcome: failedIds.has(id)
          ? ("failed" as const)
          : ("enriched" as const),
      })),
      later,
    );
  }

  const retry = selectNextRunBatch(state);
  expect(primarySeen).toEqual(manifest);
  expect(retry.projectIds).toEqual([...failedIds]);
  state = applyAttemptResults(state, results(retry.projectIds, "retry"), later);
  expect(state.status).toBe("complete");
  expect(
    Object.values(state.attempts).filter((attempts) => attempts === 2),
  ).toHaveLength(3);
});
