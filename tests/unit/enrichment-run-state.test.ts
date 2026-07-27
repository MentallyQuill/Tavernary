import { expect, test } from "vitest";

import {
  applyAttemptResults,
  approveCanaryDeployment,
  assertFullRolloutAllowed,
  assertSuccessfulCanaryEntries,
  createEnrichmentRunState as createRawEnrichmentRunState,
  recordCheckpointPublication,
  recordFullDeployment,
  selectNextRunBatch,
} from "../../scripts/catalog/enrichment-run-state.mjs";

const now = "2026-07-24T00:00:00.000Z";
const later = "2026-07-24T00:01:00.000Z";
const model = "minimax/minimax-m3:thinking";

function createEnrichmentRunState(
  input: Omit<Parameters<typeof createRawEnrichmentRunState>[0], "model"> & {
    model?: string;
  },
) {
  return createRawEnrichmentRunState({
    ...input,
    model: input.model ?? model,
  });
}

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

test("freezes selection mode and manual exclusions in new state", () => {
  const state = createEnrichmentRunState({
    mode: "full",
    manifest: ["automatic"],
    runId: "run",
    now,
    selectionMode: "all-automatic",
    manualExclusions: [
      {
        id: "manual",
        reason_code: "manual-enrichment-policy",
        enrichment_note: "Requires review.",
      },
    ],
  });

  expect(state.selection_mode).toBe("all-automatic");
  expect(state.manual_exclusions).toEqual([
    {
      id: "manual",
      reason_code: "manual-enrichment-policy",
      enrichment_note: "Requires review.",
    },
  ]);
  expect(() => (state.manual_exclusions as Array<unknown>).push({})).toThrow();
});

test("rejects invalid manual exclusions and selection modes", () => {
  const base = {
    mode: "full" as const,
    manifest: ["automatic"],
    runId: "run",
    now,
  };

  expect(() =>
    createEnrichmentRunState({
      ...base,
      selectionMode: "everything" as "pending",
    }),
  ).toThrow("selection mode");
  expect(() =>
    createEnrichmentRunState({
      ...base,
      manualExclusions: [
        {
          id: "manual",
          reason_code: "manual-enrichment-policy",
          enrichment_note: "Requires review.",
        },
        {
          id: "manual",
          reason_code: "manual-enrichment-policy",
          enrichment_note: "Requires review.",
        },
      ],
    }),
  ).toThrow("unique");
  expect(() =>
    createEnrichmentRunState({
      ...base,
      manualExclusions: [
        {
          id: "manual",
          reason_code: "manual-enrichment-policy",
          enrichment_note: "",
        },
      ],
    }),
  ).toThrow("note");
  expect(() =>
    createEnrichmentRunState({
      ...base,
      manualExclusions: [
        {
          id: "automatic",
          reason_code: "manual-enrichment-policy",
          enrichment_note: "Requires review.",
        },
      ],
    }),
  ).toThrow("overlap");
});

test("pins the configured model and rejects a different full-rollout model", () => {
  const manifest = ["a", "b", "c", "d", "e"];
  let canary = createEnrichmentRunState({
    mode: "canary",
    manifest,
    runId: "canary",
    now,
    model,
  });
  canary = applyAttemptResults(canary, results(manifest, "primary"), later);
  const passed = approveCanaryDeployment(canary, {
    commitSha: "b".repeat(40),
    deploymentRunId: 12345,
    now: later,
  });

  expect(passed.expected_model).toBe(model);
  expect(() => assertFullRolloutAllowed(passed, model)).not.toThrow();
  expect(() => assertFullRolloutAllowed(passed, "other/model")).toThrow(
    "configured model",
  );
});

test("rejects attempt metadata from a different model", () => {
  const state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a"],
    runId: "full",
    now,
  });

  expect(() =>
    applyAttemptResults(
      state,
      [
        {
          id: "a",
          phase: "primary",
          outcome: "enriched",
          provider: {
            requestedModel: "other/model",
            returnedModel: "other/model",
            latencyMs: 10,
          },
        },
      ],
      later,
    ),
  ).toThrow("configured model");
});

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

test("maps retry outcomes and completes with isolated errors", () => {
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
      {
        id: "b",
        phase: "retry",
        outcome: "failed",
        reasonCode: "output-invalid",
      },
    ],
    later,
  );

  expect(state).toMatchObject({
    status: "complete-with-errors",
    phase: "complete",
    attempts: { a: 2, b: 2 },
    aggregates: {
      "retry-enriched": 1,
      "final-failure": 1,
    },
  });
  expect(selectNextRunBatch(state).projectIds).toEqual([]);
});

test("completes with errors when a full rollout has an isolated source exception", () => {
  const initial = createEnrichmentRunState({
    mode: "full",
    manifest: ["a", "b"],
    runId: "run-1",
    now,
  });
  const state = applyAttemptResults(
    initial,
    [
      { id: "a", phase: "primary", outcome: "enriched" },
      {
        id: "b",
        phase: "primary",
        outcome: "source-not-ready",
        reasonCode: "unhealthy-source",
      },
    ],
    later,
  );

  expect(state).toMatchObject({
    status: "complete-with-errors",
    phase: "complete",
    aggregates: { enriched: 1, "source-not-ready": 1 },
  });
});

test.each([
  "provider-authentication-failed",
  "provider-model-mismatch",
  "write-failed",
])("fails a full rollout containing systemic reason %s", (reasonCode) => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a"],
    runId: "systemic",
    now,
  });
  state = applyAttemptResults(
    state,
    [{ id: "a", phase: "primary", outcome: "failed", reasonCode }],
    later,
  );

  expect(state).toMatchObject({
    status: "failed",
    phase: "complete",
    retry_queue: [],
    entries: { a: { attempt: 1, outcome: "final-failure" } },
  });
});

test("completes with errors when every full-rollout record remains provisional", () => {
  const initial = createEnrichmentRunState({
    mode: "full",
    manifest: ["a", "b"],
    runId: "zero-success",
    now,
  });
  const state = applyAttemptResults(
    initial,
    [
      {
        id: "a",
        phase: "primary",
        outcome: "source-not-ready",
        reasonCode: "unhealthy-source",
      },
      {
        id: "b",
        phase: "primary",
        outcome: "source-not-ready",
        reasonCode: "stale-source",
      },
    ],
    later,
  );

  expect(state).toMatchObject({
    status: "complete-with-errors",
    phase: "complete",
    aggregates: { "source-not-ready": 2 },
  });
});

test("fails a full rollout whose terminal entries do not cover its manifest", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a", "b"],
    runId: "run-1",
    now,
  });
  state = applyAttemptResults(
    state,
    [
      { id: "a", phase: "primary", outcome: "failed" },
      { id: "b", phase: "primary", outcome: "enriched" },
    ],
    later,
  );
  delete state.entries.b;
  state = applyAttemptResults(
    state,
    [{ id: "a", phase: "retry", outcome: "enriched" }],
    later,
  );

  expect(state).toMatchObject({
    status: "failed",
    phase: "complete",
  });
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

test("accepts five successes from a seven-project canary pool", () => {
  const manifest = ["a", "b", "c", "d", "e", "f", "g"];
  let state = createEnrichmentRunState({
    mode: "canary",
    manifest,
    runId: "pooled-canary",
    now,
  });
  state = applyAttemptResults(
    state,
    manifest.map((id, index) => ({
      id,
      phase: "primary" as const,
      outcome: index < 5 ? ("enriched" as const) : ("failed" as const),
      ...(index < 5 ? {} : { reasonCode: "output-invalid" }),
    })),
    later,
  );
  state = applyAttemptResults(
    state,
    ["f", "g"].map((id) => ({
      id,
      phase: "retry" as const,
      outcome: "failed" as const,
      reasonCode: "output-invalid",
    })),
    later,
  );

  expect(state).toMatchObject({
    status: "awaiting-deployment",
    aggregates: { enriched: 5, "final-failure": 2 },
  });
  expect(() => assertSuccessfulCanaryEntries(state)).not.toThrow();
});

test("rejects a seven-project canary pool with fewer than five successes", () => {
  const manifest = ["a", "b", "c", "d", "e", "f", "g"];
  let state = createEnrichmentRunState({
    mode: "canary",
    manifest,
    runId: "insufficient-canary",
    now,
  });
  state = applyAttemptResults(
    state,
    manifest.map((id, index) => ({
      id,
      phase: "primary" as const,
      outcome: index < 4 ? ("enriched" as const) : ("failed" as const),
      ...(index < 4 ? {} : { reasonCode: "output-invalid" }),
    })),
    later,
  );
  state = applyAttemptResults(
    state,
    ["e", "f", "g"].map((id) => ({
      id,
      phase: "retry" as const,
      outcome: "failed" as const,
      reasonCode: "output-invalid",
    })),
    later,
  );

  expect(state.status).toBe("failed");
  expect(() => assertSuccessfulCanaryEntries(state)).toThrow("five successful");
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
  expect(() => assertFullRolloutAllowed(awaitingDeployment, model)).toThrow(
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
  expect(() => assertFullRolloutAllowed(passed, model)).not.toThrow();
  expect(() =>
    assertFullRolloutAllowed(
      {
        ...passed,
        primary_cursor: 0,
        attempts: {},
        entries: {},
      },
      model,
    ),
  ).toThrow("deployed canary");

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
  expect(() => assertFullRolloutAllowed(failed, model)).toThrow(
    "deployed canary",
  );
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

test("a systemic primary failure stops immediately without entering retry", () => {
  const state = applyAttemptResults(
    createEnrichmentRunState({
      mode: "full",
      manifest: ["a"],
      runId: "systemic-primary",
      now,
    }),
    [
      {
        id: "a",
        phase: "primary",
        outcome: "failed",
        reasonCode: "provider-authentication-failed",
      },
    ],
    later,
  );

  expect(state).toMatchObject({
    status: "failed",
    phase: "complete",
    retry_queue: [],
    entries: {
      a: {
        attempt: 1,
        outcome: "final-failure",
        reason_code: "provider-authentication-failed",
      },
    },
  });
});

test("a systemic skipped result stops before later frozen-state batches", () => {
  const state = applyAttemptResults(
    createEnrichmentRunState({
      mode: "full",
      manifest: ["a", "b"],
      runId: "missing-record",
      now,
      batchSize: 1,
    }),
    [
      {
        id: "a",
        phase: "primary",
        outcome: "skipped",
        reasonCode: "record-missing",
      },
    ],
    later,
  );

  expect(state).toMatchObject({
    status: "failed",
    phase: "complete",
    primary_cursor: 1,
    entries: {
      a: {
        outcome: "final-failure",
        reason_code: "record-missing",
      },
    },
  });
  expect(selectNextRunBatch(state).projectIds).toEqual([]);
});

test("records the exact published checkpoint without changing progress", () => {
  const state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a"],
    runId: "publication",
    now,
  });
  const published = recordCheckpointPublication(state, {
    commitSha: "c".repeat(40),
    now: later,
  });

  expect(published.publication).toEqual({
    checkpoint_commit_sha: "c".repeat(40),
    recorded_at: later,
  });
  expect(published.primary_cursor).toBe(0);
  expect(() =>
    recordCheckpointPublication(state, {
      commitSha: "not-a-sha",
      now: later,
    }),
  ).toThrow("checkpoint commit SHA");
});

test("records a full deployment only for its exact durable checkpoint", () => {
  const state = recordCheckpointPublication(
    applyAttemptResults(
      createEnrichmentRunState({
        mode: "full",
        manifest: ["a"],
        runId: "full-deployment",
        now,
      }),
      [{ id: "a", phase: "primary", outcome: "enriched" }],
      later,
    ),
    { commitSha: "c".repeat(40), now },
  );
  const deployed = recordFullDeployment(state, {
    commitSha: "c".repeat(40),
    deploymentRunId: 12345,
    now: later,
  });

  expect(deployed.deployment).toEqual({
    commit_sha: "c".repeat(40),
    run_id: 12345,
    verified_at: later,
  });
  expect(() =>
    recordFullDeployment(state, {
      commitSha: "d".repeat(40),
      deploymentRunId: 12345,
      now: later,
    }),
  ).toThrow("does not match");
});

test("allows a warning-only full checkpoint that defers canary failures", () => {
  const state = createEnrichmentRunState({
    mode: "full",
    manifest: [],
    deferredIds: ["failed-canary-a", "failed-canary-b"],
    runId: "deferred-only",
    now,
  });

  expect(state).toMatchObject({
    status: "complete-with-errors",
    phase: "complete",
    manifest: [],
    deferred_ids: ["failed-canary-a", "failed-canary-b"],
  });
  expect(selectNextRunBatch(state).projectIds).toEqual([]);
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
