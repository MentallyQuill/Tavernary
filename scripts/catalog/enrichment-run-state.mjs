const outcomes = [
  "enriched",
  "fallback",
  "source-not-ready",
  "retry-pending",
  "retry-enriched",
  "retry-fallback",
  "final-failure",
  "skipped",
];

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function normalizedManifest(mode, manifest) {
  if (!Array.isArray(manifest)) throw new Error("manifest must be an array");
  if (manifest.some((id) => typeof id !== "string" || id.trim().length === 0)) {
    throw new Error("manifest IDs must be non-empty strings");
  }
  const unique = [...new Set(manifest)].sort((left, right) =>
    left.localeCompare(right),
  );
  if (mode === "canary" && (manifest.length !== 5 || unique.length !== 5)) {
    throw new Error("canary manifest must contain exactly five unique IDs");
  }
  if (mode === "full" && unique.length === 0) {
    throw new Error("full manifest must contain at least one ID");
  }
  return Object.freeze(unique);
}

function aggregateEntries(entries) {
  const aggregates = Object.fromEntries(
    outcomes.map((outcome) => [outcome, 0]),
  );
  for (const entry of Object.values(entries)) {
    if (Object.hasOwn(aggregates, entry.outcome)) {
      aggregates[entry.outcome] += 1;
    }
  }
  return aggregates;
}

function terminalState(state) {
  if (state.mode === "full") return "complete";
  return Object.values(state.entries).every((entry) =>
    ["enriched", "fallback", "retry-enriched", "retry-fallback"].includes(
      entry.outcome,
    ),
  )
    ? "awaiting-deployment"
    : "failed";
}

function entryForResult(result, attempt, outcome, now) {
  const entry = {
    id: result.id,
    attempt,
    phase: result.phase,
    outcome,
    completed_at: now,
  };
  const mappings = [
    ["sourceKind", "source_kind"],
    ["repositoryId", "repository_id"],
    ["headSha", "head_sha"],
    ["readmePath", "readme_path"],
    ["readmeRef", "readme_ref"],
    ["reasonCode", "reason_code"],
    ["message", "message"],
  ];
  for (const [source, target] of mappings) {
    if (result[source] !== undefined) entry[target] = result[source];
  }
  if (result.provider) {
    entry.requested_model = result.provider.requestedModel;
    entry.returned_model = result.provider.returnedModel;
    entry.latency_ms = result.provider.latencyMs;
  }
  return entry;
}

export function createEnrichmentRunState(input) {
  if (!["canary", "full"].includes(input.mode)) {
    throw new Error("run mode must be canary or full");
  }
  if (typeof input.runId !== "string" || input.runId.length === 0) {
    throw new Error("run ID is required");
  }
  const batchSize = input.batchSize ?? 20;
  const concurrency = input.concurrency ?? 4;
  assertPositiveInteger(batchSize, "batch size");
  assertPositiveInteger(concurrency, "concurrency");
  if (concurrency > 4) throw new Error("concurrency cannot exceed four");

  return {
    schema_version: 1,
    run_id: input.runId,
    mode: input.mode,
    status: "running",
    phase: "primary",
    expected_model: "MiniMax-M3",
    batch_size: batchSize,
    concurrency,
    created_at: input.now,
    updated_at: input.now,
    manifest: normalizedManifest(input.mode, input.manifest),
    primary_cursor: 0,
    retry_queue: [],
    retry_cursor: 0,
    attempts: {},
    entries: {},
    deployment: null,
    aggregates: Object.fromEntries(outcomes.map((outcome) => [outcome, 0])),
  };
}

export function selectNextRunBatch(state) {
  if (state.phase === "complete") {
    return { phase: "primary", projectIds: [], attempt: 1 };
  }
  if (state.phase === "primary") {
    return {
      phase: "primary",
      projectIds: state.manifest.slice(
        state.primary_cursor,
        state.primary_cursor + state.batch_size,
      ),
      attempt: 1,
    };
  }
  return {
    phase: "retry",
    projectIds: state.retry_queue.slice(
      state.retry_cursor,
      state.retry_cursor + state.batch_size,
    ),
    attempt: 2,
  };
}

function assertAttemptResults(state, results) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("attempt results are required");
  }
  const ids = results.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("attempt results contain duplicate IDs");
  }
  const expected = selectNextRunBatch(state);
  if (results.some(({ phase }) => phase !== expected.phase)) {
    throw new Error(`attempt results must use ${expected.phase} phase`);
  }
  if (JSON.stringify(ids) !== JSON.stringify(expected.projectIds)) {
    throw new Error(
      `attempt results did not match expected IDs: ${expected.projectIds.join(", ")}`,
    );
  }
}

export function applyAttemptResults(state, results, now) {
  assertAttemptResults(state, results);
  const next = structuredClone(state);
  next.manifest = Object.freeze([...state.manifest]);
  const attempt = state.phase === "primary" ? 1 : 2;

  for (const result of results) {
    if (
      ![
        "enriched",
        "fallback",
        "source-not-ready",
        "failed",
        "skipped",
      ].includes(result.outcome)
    ) {
      throw new Error(`unknown attempt outcome: ${result.outcome}`);
    }
    const previousAttempts = next.attempts[result.id] ?? 0;
    if (previousAttempts !== attempt - 1) {
      throw new Error(`${result.id} has an invalid attempt count`);
    }
    next.attempts[result.id] = attempt;

    let outcome = result.outcome;
    if (state.phase === "primary" && result.outcome === "failed") {
      outcome = "retry-pending";
      if (!next.retry_queue.includes(result.id)) {
        next.retry_queue.push(result.id);
      }
    } else if (state.phase === "retry") {
      if (result.outcome === "enriched") outcome = "retry-enriched";
      else if (result.outcome === "fallback") outcome = "retry-fallback";
      else if (
        result.outcome === "failed" ||
        result.outcome === "source-not-ready"
      ) {
        outcome = "final-failure";
      }
    }
    next.entries[result.id] = entryForResult(result, attempt, outcome, now);
  }

  if (state.phase === "primary") {
    next.primary_cursor += results.length;
    if (next.primary_cursor === next.manifest.length) {
      if (next.retry_queue.length > 0) {
        next.phase = "retry";
      } else {
        next.phase = "complete";
        next.status = terminalState(next);
      }
    }
  } else {
    next.retry_cursor += results.length;
    if (next.retry_cursor === next.retry_queue.length) {
      next.phase = "complete";
      next.status = terminalState(next);
    }
  }
  next.updated_at = now;
  next.aggregates = aggregateEntries(next.entries);
  return next;
}

export function assertFullRolloutAllowed(previous) {
  if (
    previous?.mode !== "canary" ||
    previous?.status !== "passed" ||
    previous?.phase !== "complete" ||
    previous?.expected_model !== "MiniMax-M3" ||
    !/^[0-9a-f]{40}$/u.test(previous?.deployment?.commit_sha ?? "") ||
    !Number.isInteger(previous?.deployment?.run_id) ||
    previous.deployment.run_id < 1 ||
    typeof previous?.deployment?.verified_at !== "string"
  ) {
    throw new Error("full rollout requires a deployed canary using MiniMax-M3");
  }
}

export function approveCanaryDeployment(
  state,
  { commitSha, deploymentRunId, now },
) {
  if (
    state?.mode !== "canary" ||
    state?.status !== "awaiting-deployment" ||
    state?.phase !== "complete"
  ) {
    throw new Error("canary must be awaiting deployment approval");
  }
  if (!/^[0-9a-f]{40}$/u.test(commitSha ?? "")) {
    throw new Error("canary deployment commit SHA is invalid");
  }
  if (!Number.isInteger(deploymentRunId) || deploymentRunId < 1) {
    throw new Error("canary deployment run ID is invalid");
  }
  if (typeof now !== "string" || now.length === 0) {
    throw new Error("canary deployment verification time is required");
  }

  const next = structuredClone(state);
  next.manifest = Object.freeze([...state.manifest]);
  next.status = "passed";
  next.updated_at = now;
  next.deployment = {
    commit_sha: commitSha,
    run_id: deploymentRunId,
    verified_at: now,
  };
  return next;
}
