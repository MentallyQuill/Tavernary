import { validateCatalogCopyMetadata } from "./catalog-copy-contract.mjs";

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
const selectionModes = new Set(["pending", "all-automatic"]);
const manualEnrichmentReasonCode = "manual-enrichment-policy";

const systemicFailureCodes = new Set([
  "provider-configuration-invalid",
  "provider-authentication-failed",
  "provider-model-mismatch",
  "provider-request-failed",
  "write-failed",
  "source-load-failed",
  "record-missing",
]);

export function failureScope(reasonCode) {
  return systemicFailureCodes.has(reasonCode) ? "systemic" : "isolated";
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function normalizedDeferredIds(mode, deferredIds) {
  if (!Array.isArray(deferredIds)) {
    throw new Error("deferred IDs must be an array");
  }
  if (
    deferredIds.some((id) => typeof id !== "string" || id.trim().length === 0)
  ) {
    throw new Error("deferred IDs must be non-empty strings");
  }
  const unique = [...new Set(deferredIds)].sort((left, right) =>
    left.localeCompare(right),
  );
  if (unique.length !== deferredIds.length) {
    throw new Error("deferred IDs must be unique");
  }
  if (mode === "canary" && unique.length > 0) {
    throw new Error("canary runs cannot defer project IDs");
  }
  return Object.freeze(unique);
}

function normalizedManifest(mode, manifest, deferredIds) {
  if (!Array.isArray(manifest)) throw new Error("manifest must be an array");
  if (manifest.some((id) => typeof id !== "string" || id.trim().length === 0)) {
    throw new Error("manifest IDs must be non-empty strings");
  }
  const unique = [...new Set(manifest)].sort((left, right) =>
    left.localeCompare(right),
  );
  if (
    mode === "canary" &&
    (manifest.length < 5 ||
      manifest.length > 7 ||
      unique.length !== manifest.length)
  ) {
    throw new Error(
      "canary manifest must contain at least five unique IDs and at most seven",
    );
  }
  if (mode === "full" && unique.length === 0 && deferredIds.length === 0) {
    throw new Error("full manifest must contain at least one ID");
  }
  if (unique.some((id) => deferredIds.includes(id))) {
    throw new Error("manifest and deferred IDs must not overlap");
  }
  return Object.freeze(unique);
}

function normalizedManualExclusions(manualExclusions, manifest) {
  if (!Array.isArray(manualExclusions)) {
    throw new Error("manual exclusions must be an array");
  }
  const normalized = manualExclusions.map((entry) => {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      entry.id.trim().length === 0
    ) {
      throw new Error("manual exclusion IDs must be non-empty strings");
    }
    if (entry.reason_code !== manualEnrichmentReasonCode) {
      throw new Error("manual exclusion reason code is invalid");
    }
    if (
      typeof entry.enrichment_note !== "string" ||
      entry.enrichment_note.trim().length === 0
    ) {
      throw new Error("manual exclusion note must be a non-empty string");
    }
    return Object.freeze({
      id: entry.id,
      reason_code: manualEnrichmentReasonCode,
      enrichment_note: entry.enrichment_note,
    });
  });
  const ids = normalized.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("manual exclusion IDs must be unique");
  }
  if (ids.some((id) => manifest.includes(id))) {
    throw new Error("manual exclusions must not overlap the manifest");
  }
  return Object.freeze(
    normalized.sort((left, right) => left.id.localeCompare(right.id)),
  );
}

function freezeSelectionState(next, state) {
  next.selection_mode = state.selection_mode ?? "pending";
  next.manual_exclusions = Object.freeze(
    (state.manual_exclusions ?? []).map((entry) => Object.freeze({ ...entry })),
  );
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
  const successfulOutcomes = new Set([
    "enriched",
    "fallback",
    "retry-enriched",
    "retry-fallback",
  ]);
  const entryIds = Object.keys(state.entries);
  const fullyAccounted =
    entryIds.length === state.manifest.length &&
    state.manifest.every((id) => state.entries[id]);
  if (!fullyAccounted) return "failed";
  const systemic = state.manifest.some(
    (id) => failureScope(state.entries[id]?.reason_code) === "systemic",
  );
  if (systemic) return "failed";
  const successfulCount = state.manifest.filter((id) =>
    successfulOutcomes.has(state.entries[id]?.outcome),
  ).length;
  if (state.mode === "canary") {
    return successfulCount >= 5 ? "awaiting-deployment" : "failed";
  }
  if (state.manifest.length === 0 && state.deferred_ids.length > 0) {
    return "complete-with-errors";
  }
  if (
    successfulCount === state.manifest.length &&
    state.deferred_ids.length === 0
  ) {
    return "complete";
  }
  return "complete-with-errors";
}

function entryForResult(result, attempt, outcome, now, previousEntry) {
  const entry = {
    id: result.id,
    attempt,
    phase: result.phase,
    outcome,
    completed_at: now,
  };
  const mappings = [
    ["sourceKind", "source_kind"],
    ["sourceIdentity", "source_identity"],
    ["repositoryId", "repository_id"],
    ["headSha", "head_sha"],
    ["readmePath", "readme_path"],
    ["readmeRef", "readme_ref"],
    ["redditPostId", "reddit_post_id"],
    ["sourceId", "source_id"],
    ["requestedFields", "requested_fields"],
    ["vocabularyHash", "vocabulary_hash"],
    ["finalTags", "final_tags"],
    ["tagEvidence", "tag_evidence"],
    ["summaryEvidence", "summary_evidence"],
    ["tagGenerationDiagnostic", "tag_generation_diagnostic"],
    ["reasonCode", "reason_code"],
    ["enrichmentNote", "enrichment_note"],
    ["diagnosticCode", "diagnostic_code"],
    ["repairHint", "repair_hint"],
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
  if (
    result.output &&
    ["result", "change_reasons", "policy_signal"].some(
      (key) => result.output[key] !== undefined,
    )
  ) {
    const copyValidation = validateCatalogCopyMetadata({
      result: result.output.result,
      change_reasons: result.output.change_reasons,
      policy_signal: result.output.policy_signal,
    });
    if (!copyValidation.valid) {
      throw new Error("attempt copy metadata is invalid");
    }
    entry.copy_result = result.output.result;
    entry.copy_change_reasons = [...result.output.change_reasons];
    entry.copy_policy_signal = result.output.policy_signal;
  }
  const currentProviderCalls =
    result.providerCallCount ?? (result.provider ? 1 : 0);
  const providerCalls =
    (previousEntry?.provider_calls ?? 0) + currentProviderCalls;
  if (providerCalls > 0) {
    entry.provider_calls = providerCalls;
    entry.provider_repair_calls =
      (previousEntry?.provider_repair_calls ?? 0) +
      (result.providerRepairCallCount ?? 0);
    entry.provider_rate_limit_events =
      (previousEntry?.provider_rate_limit_events ?? 0) +
      (result.providerRateLimitCount ?? 0);
    entry.provider_latency_ms_total =
      (previousEntry?.provider_latency_ms_total ?? 0) +
      (result.providerLatencyMsTotal ?? result.provider?.latencyMs ?? 0);
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
  if (
    typeof input.model !== "string" ||
    input.model.length === 0 ||
    /\s/u.test(input.model)
  ) {
    throw new Error("configured model is required");
  }
  const batchSize = input.batchSize ?? 20;
  const concurrency = input.concurrency ?? 6;
  assertPositiveInteger(batchSize, "batch size");
  assertPositiveInteger(concurrency, "concurrency");
  if (concurrency > 8) throw new Error("concurrency cannot exceed eight");
  const deferredIds = normalizedDeferredIds(
    input.mode,
    input.deferredIds ?? [],
  );
  const manifest = normalizedManifest(input.mode, input.manifest, deferredIds);
  const selectionMode = input.selectionMode ?? "pending";
  if (!selectionModes.has(selectionMode)) {
    throw new Error(`unsupported enrichment selection mode: ${selectionMode}`);
  }
  const manualExclusions = normalizedManualExclusions(
    input.manualExclusions ?? [],
    manifest,
  );
  const deferredOnly =
    input.mode === "full" && manifest.length === 0 && deferredIds.length > 0;
  const authorizedCanaryRunId = input.authorizedCanaryRunId ?? null;
  if (
    authorizedCanaryRunId !== null &&
    (input.mode !== "full" ||
      typeof authorizedCanaryRunId !== "string" ||
      authorizedCanaryRunId.length === 0)
  ) {
    throw new Error("authorized canary run ID is valid only for full rollouts");
  }

  return {
    schema_version: 1,
    run_id: input.runId,
    mode: input.mode,
    status: deferredOnly ? "complete-with-errors" : "running",
    phase: deferredOnly ? "complete" : "primary",
    expected_model: input.model,
    selection_mode: selectionMode,
    manual_exclusions: manualExclusions,
    batch_size: batchSize,
    concurrency,
    created_at: input.now,
    updated_at: input.now,
    manifest,
    deferred_ids: deferredIds,
    authorized_canary_run_id: authorizedCanaryRunId,
    primary_cursor: 0,
    retry_queue: [],
    retry_cursor: 0,
    attempts: {},
    entries: {},
    publication: null,
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
  if (
    results.some(
      ({ provider }) =>
        provider && provider.requestedModel !== state.expected_model,
    )
  ) {
    throw new Error("attempt result does not use the configured model");
  }
}

export function applyAttemptResults(state, results, now) {
  assertAttemptResults(state, results);
  const next = structuredClone(state);
  next.manifest = Object.freeze([...state.manifest]);
  freezeSelectionState(next, state);
  const attempt = state.phase === "primary" ? 1 : 2;
  let systemicAttemptFailure = false;

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
    if (failureScope(result.reasonCode) === "systemic") {
      outcome = "final-failure";
      systemicAttemptFailure = true;
    } else if (state.phase === "primary" && result.outcome === "failed") {
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
    next.entries[result.id] = entryForResult(
      result,
      attempt,
      outcome,
      now,
      next.entries[result.id],
    );
  }

  if (systemicAttemptFailure) {
    if (state.phase === "primary") next.primary_cursor += results.length;
    else next.retry_cursor += results.length;
    for (const id of next.retry_queue) {
      if (next.entries[id]?.outcome === "retry-pending") {
        next.entries[id].outcome = "final-failure";
      }
    }
    next.retry_queue = [];
    next.retry_cursor = 0;
    next.phase = "complete";
    next.status = "failed";
    next.updated_at = now;
    next.aggregates = aggregateEntries(next.entries);
    return next;
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

export function recordCheckpointPublication(state, { commitSha, now }) {
  if (!/^[0-9a-f]{40}$/u.test(commitSha ?? "")) {
    throw new Error("checkpoint commit SHA is invalid");
  }
  if (typeof now !== "string" || now.length === 0) {
    throw new Error("checkpoint publication time is required");
  }
  const next = structuredClone(state);
  next.manifest = Object.freeze([...state.manifest]);
  next.deferred_ids = Object.freeze([...(state.deferred_ids ?? [])]);
  freezeSelectionState(next, state);
  next.publication = {
    checkpoint_commit_sha: commitSha,
    recorded_at: now,
  };
  next.updated_at = now;
  return next;
}

export function recordFullDeployment(
  state,
  { commitSha, deploymentRunId, now },
) {
  if (
    state?.mode !== "full" ||
    state?.phase !== "complete" ||
    !["complete", "complete-with-errors"].includes(state?.status)
  ) {
    throw new Error("full rollout must be complete before deployment");
  }
  if (state.publication?.checkpoint_commit_sha !== commitSha) {
    throw new Error(
      "full deployment commit does not match its published checkpoint",
    );
  }
  if (!/^[0-9a-f]{40}$/u.test(commitSha ?? "")) {
    throw new Error("full deployment commit SHA is invalid");
  }
  if (!Number.isInteger(deploymentRunId) || deploymentRunId < 1) {
    throw new Error("full deployment run ID is invalid");
  }
  if (typeof now !== "string" || now.length === 0) {
    throw new Error("full deployment verification time is required");
  }
  const next = structuredClone(state);
  next.manifest = Object.freeze([...state.manifest]);
  next.deferred_ids = Object.freeze([...(state.deferred_ids ?? [])]);
  freezeSelectionState(next, state);
  next.deployment = {
    commit_sha: commitSha,
    run_id: deploymentRunId,
    verified_at: now,
  };
  next.updated_at = now;
  return next;
}

export function assertSuccessfulCanaryEntries(state) {
  const manifest = Array.isArray(state?.manifest) ? state.manifest : [];
  const retryQueue = Array.isArray(state?.retry_queue) ? state.retry_queue : [];
  const entries =
    state?.entries && typeof state.entries === "object" ? state.entries : {};
  const attempts =
    state?.attempts && typeof state.attempts === "object" ? state.attempts : {};
  const manifestIds = [...manifest].sort();
  const entryIds = Object.keys(entries).sort();
  const attemptIds = Object.keys(attempts).sort();
  const retryIds = new Set(retryQueue);

  if (
    state?.mode !== "canary" ||
    state?.phase !== "complete" ||
    manifest.length < 5 ||
    manifest.length > 7 ||
    new Set(manifest).size !== manifest.length ||
    state.primary_cursor !== manifest.length ||
    state.retry_cursor !== retryQueue.length ||
    new Set(retryQueue).size !== retryQueue.length ||
    retryQueue.some((id) => !manifest.includes(id)) ||
    JSON.stringify(entryIds) !== JSON.stringify(manifestIds) ||
    JSON.stringify(attemptIds) !== JSON.stringify(manifestIds)
  ) {
    throw new Error(
      "canary must contain at least five successful entries with complete accounting",
    );
  }

  let successfulCount = 0;
  for (const id of manifest) {
    const entry = entries[id];
    const attempt = attempts[id];
    const retried = retryIds.has(id);
    const successful = retried
      ? ["retry-enriched", "retry-fallback"].includes(entry?.outcome)
      : ["enriched", "fallback"].includes(entry?.outcome);
    const validOutcome =
      successful ||
      (retried
        ? entry?.outcome === "final-failure"
        : ["source-not-ready", "skipped"].includes(entry?.outcome));
    if (
      entry?.id !== id ||
      entry?.attempt !== attempt ||
      attempt !== (retried ? 2 : 1) ||
      entry?.phase !== (retried ? "retry" : "primary") ||
      !validOutcome
    ) {
      throw new Error(
        "canary must contain at least five successful entries with complete accounting",
      );
    }
    if (successful) successfulCount += 1;
    if (failureScope(entry?.reason_code) === "systemic") {
      throw new Error("canary contains a systemic failure");
    }
  }
  if (successfulCount < 5) {
    throw new Error("canary must contain at least five successful entries");
  }
}

export function assertFullRolloutAllowed(
  previous,
  model,
  selectionMode = "pending",
) {
  try {
    assertSuccessfulCanaryEntries(previous);
    if (
      previous?.status !== "passed" ||
      previous?.expected_model !== model ||
      previous?.selection_mode !== selectionMode ||
      !/^[0-9a-f]{40}$/u.test(previous?.deployment?.commit_sha ?? "") ||
      !Number.isInteger(previous?.deployment?.run_id) ||
      previous.deployment.run_id < 1 ||
      typeof previous?.deployment?.verified_at !== "string"
    ) {
      throw new Error("invalid deployed canary");
    }
  } catch {
    throw new Error(
      "full rollout requires a deployed canary using the configured model",
    );
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
  assertSuccessfulCanaryEntries(state);
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
  freezeSelectionState(next, state);
  next.status = "passed";
  next.updated_at = now;
  next.deployment = {
    commit_sha: commitSha,
    run_id: deploymentRunId,
    verified_at: now,
  };
  return next;
}
