import { assertSuccessfulCanaryEntries } from "./enrichment-run-state.mjs";

const outcomeNames = [
  "enriched",
  "fallback",
  "source-not-ready",
  "retry-pending",
  "retry-enriched",
  "retry-fallback",
  "final-failure",
  "skipped",
];

const safeMessages = {
  "missing-snapshot": "Repository snapshot is missing.",
  "invalid-snapshot": "Repository snapshot is invalid.",
  "project-mismatch": "Repository snapshot belongs to another project.",
  "unhealthy-source": "Snapshot source is unavailable.",
  "stale-source": "Repository snapshot is stale.",
  "missing-permanent-identity": "Permanent repository identity is missing.",
  "repository-mismatch": "Repository snapshot path does not match the record.",
  "identity-mismatch":
    "Repository snapshot identity does not match the record.",
  "readme-fetch-failed": "GitHub README request failed.",
  "readme-authentication-failed":
    "GitHub README authentication is unavailable.",
  "readme-rate-limited": "GitHub README request was rate limited.",
  "readme-server-error": "GitHub README service is unavailable.",
  "readme-unusable": "GitHub README content is unusable.",
  "provider-timeout": "The enrichment provider timed out after 120 seconds.",
  "provider-rate-limited": "The enrichment provider returned HTTP 429.",
  "provider-server-error": "The enrichment provider returned a server error.",
  "provider-authentication-failed":
    "The enrichment provider rejected authentication.",
  "provider-request-failed": "The enrichment provider rejected the request.",
  "provider-network-error": "The enrichment provider request failed.",
  "provider-response-invalid":
    "The enrichment provider returned invalid structured content.",
  "provider-model-mismatch":
    "The enrichment provider returned an unexpected model identifier.",
  "provider-configuration-invalid":
    "Enrichment provider configuration is required.",
  "output-invalid": "The enrichment provider output failed validation.",
  "write-failed": "Validated enrichment could not be written.",
  "source-load-failed": "Enrichment source loading failed.",
  "record-missing": "Registry record is missing.",
  "record-ineligible": "Registry record is no longer eligible.",
};

function sanitizedEntry(entry) {
  const result = {
    id: entry.id,
    attempt: entry.attempt,
    phase: entry.phase,
    outcome: entry.outcome,
  };
  for (const key of [
    "source_kind",
    "repository_id",
    "head_sha",
    "readme_path",
    "readme_ref",
    "requested_model",
    "returned_model",
    "latency_ms",
    "reason_code",
    "diagnostic_code",
    "repair_hint",
  ]) {
    if (entry[key] !== undefined) result[key] = entry[key];
  }
  if (entry.reason_code !== undefined) {
    result.message =
      safeMessages[entry.reason_code] ?? "Enrichment attempt failed.";
  }
  result.completed_at = entry.completed_at;
  return result;
}

function aggregates(entries) {
  const result = Object.fromEntries(
    outcomeNames.map((outcome) => [outcome, 0]),
  );
  for (const entry of Object.values(entries)) {
    if (Object.hasOwn(result, entry.outcome)) result[entry.outcome] += 1;
  }
  return result;
}

export function createEnrichmentReport(state) {
  const entries = Object.fromEntries(
    Object.keys(state.entries)
      .sort((left, right) => left.localeCompare(right))
      .map((id) => [id, sanitizedEntry(state.entries[id])]),
  );
  return {
    schema_version: 1,
    run_id: state.run_id,
    mode: state.mode,
    status: state.status,
    phase: state.phase,
    expected_model: state.expected_model,
    batch_size: state.batch_size,
    concurrency: state.concurrency,
    created_at: state.created_at,
    updated_at: state.updated_at,
    manifest: [...state.manifest],
    deferred_ids: [...(state.deferred_ids ?? [])],
    authorized_canary_run_id: state.authorized_canary_run_id ?? null,
    primary_cursor: state.primary_cursor,
    retry_queue: [...state.retry_queue],
    retry_cursor: state.retry_cursor,
    attempts: Object.fromEntries(
      Object.entries(state.attempts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    entries,
    publication: state.publication
      ? {
          checkpoint_commit_sha: state.publication.checkpoint_commit_sha,
          recorded_at: state.publication.recorded_at,
        }
      : null,
    deployment: state.deployment
      ? {
          commit_sha: state.deployment.commit_sha,
          run_id: state.deployment.run_id,
          verified_at: state.deployment.verified_at,
        }
      : null,
    aggregates: aggregates(entries),
  };
}

function assertUnique(values, name) {
  if (!Array.isArray(values) || new Set(values).size !== values.length) {
    throw new Error(`${name} contains duplicate IDs`);
  }
}

function assertTerminalFullAccounting(value) {
  if (
    value.mode !== "full" ||
    !["complete", "complete-with-errors"].includes(value.status)
  ) {
    return;
  }
  const manifestIds = [...value.manifest].sort();
  const entryIds = Object.keys(value.entries ?? {}).sort();
  const attemptIds = Object.keys(value.attempts ?? {}).sort();
  const retryIds = new Set(value.retry_queue);
  const successfulOutcomes = new Set([
    "enriched",
    "fallback",
    "retry-enriched",
    "retry-fallback",
  ]);
  if (
    value.phase !== "complete" ||
    value.primary_cursor !== value.manifest.length ||
    value.retry_cursor !== value.retry_queue.length ||
    JSON.stringify(entryIds) !== JSON.stringify(manifestIds) ||
    JSON.stringify(attemptIds) !== JSON.stringify(manifestIds)
  ) {
    throw new Error("terminal full report accounting is invalid");
  }
  let successfulCount = 0;
  for (const id of value.manifest) {
    const entry = value.entries[id];
    const retried = retryIds.has(id);
    const terminalOutcomes = retried
      ? new Set([
          "retry-enriched",
          "retry-fallback",
          "final-failure",
          "skipped",
        ])
      : new Set(["enriched", "fallback", "source-not-ready", "skipped"]);
    if (
      entry?.id !== id ||
      entry?.attempt !== (retried ? 2 : 1) ||
      value.attempts[id] !== entry.attempt ||
      entry?.phase !== (retried ? "retry" : "primary") ||
      !terminalOutcomes.has(entry?.outcome)
    ) {
      throw new Error("terminal full report accounting is invalid");
    }
    if (successfulOutcomes.has(entry.outcome)) successfulCount += 1;
  }
  const allSuccessful =
    successfulCount === value.manifest.length &&
    value.deferred_ids.length === 0;
  const validWarning =
    (successfulCount > 0 &&
      (!allSuccessful || value.deferred_ids.length > 0)) ||
    (value.manifest.length === 0 && value.deferred_ids.length > 0);
  if (
    (value.status === "complete" && !allSuccessful) ||
    (value.status === "complete-with-errors" && !validWarning)
  ) {
    throw new Error("terminal full report accounting is invalid");
  }
}

export function validateEnrichmentReport(value) {
  if (!value || typeof value !== "object" || value.schema_version !== 1) {
    throw new Error("enrichment report schema is invalid");
  }
  value = structuredClone(value);
  value.deferred_ids ??= [];
  value.authorized_canary_run_id ??= null;
  value.publication ??= null;
  if (
    typeof value.expected_model !== "string" ||
    value.expected_model.length === 0 ||
    /\s/u.test(value.expected_model)
  ) {
    throw new Error("enrichment report must name its configured model");
  }
  if (!["canary", "full"].includes(value.mode)) {
    throw new Error("enrichment report mode is invalid");
  }
  if (!["primary", "retry", "complete"].includes(value.phase)) {
    throw new Error("enrichment report phase is invalid");
  }
  if (
    ![
      "running",
      "awaiting-deployment",
      "passed",
      "failed",
      "complete",
      "complete-with-errors",
    ].includes(value.status)
  ) {
    throw new Error("enrichment report status is invalid");
  }
  assertUnique(value.manifest, "manifest");
  assertUnique(value.deferred_ids, "deferred IDs");
  assertUnique(value.retry_queue, "retry queue");
  if (
    value.deferred_ids.some(
      (id) =>
        typeof id !== "string" ||
        id.length === 0 ||
        value.manifest.includes(id),
    ) ||
    (value.mode === "canary" && value.deferred_ids.length > 0) ||
    (value.mode === "full" &&
      value.manifest.length === 0 &&
      (value.deferred_ids.length === 0 ||
        value.status !== "complete-with-errors" ||
        value.phase !== "complete"))
  ) {
    throw new Error("enrichment report deferred state is invalid");
  }
  if (
    value.authorized_canary_run_id !== null &&
    (value.mode !== "full" ||
      typeof value.authorized_canary_run_id !== "string" ||
      value.authorized_canary_run_id.length === 0)
  ) {
    throw new Error("enrichment report canary authorization is invalid");
  }
  if (
    value.publication !== null &&
    (!/^[0-9a-f]{40}$/u.test(value.publication?.checkpoint_commit_sha ?? "") ||
      typeof value.publication?.recorded_at !== "string" ||
      value.publication.recorded_at.length === 0)
  ) {
    throw new Error("enrichment report publication is invalid");
  }
  if (
    !Number.isInteger(value.primary_cursor) ||
    value.primary_cursor < 0 ||
    value.primary_cursor > value.manifest.length ||
    !Number.isInteger(value.retry_cursor) ||
    value.retry_cursor < 0 ||
    value.retry_cursor > value.retry_queue.length
  ) {
    throw new Error("enrichment report cursor is invalid");
  }
  if (
    value.retry_queue.some((id) => !value.manifest.includes(id)) ||
    !value.entries ||
    typeof value.entries !== "object" ||
    !value.attempts ||
    typeof value.attempts !== "object"
  ) {
    throw new Error("enrichment report state is inconsistent");
  }
  assertTerminalFullAccounting(value);
  if (value.phase === "complete" && value.status === "running") {
    throw new Error("completed enrichment report cannot be running");
  }
  if (
    value.status === "awaiting-deployment" &&
    (value.mode !== "canary" ||
      value.phase !== "complete" ||
      value.deployment !== null)
  ) {
    throw new Error("canary deployment state is invalid");
  }
  if (value.status === "awaiting-deployment" || value.status === "passed") {
    assertSuccessfulCanaryEntries(value);
  }
  if (
    value.status === "passed" &&
    (value.mode !== "canary" ||
      value.phase !== "complete" ||
      !/^[0-9a-f]{40}$/u.test(value.deployment?.commit_sha ?? "") ||
      !Number.isInteger(value.deployment?.run_id) ||
      value.deployment.run_id < 1 ||
      typeof value.deployment?.verified_at !== "string")
  ) {
    throw new Error("passed canary requires verified deployment");
  }
  if (
    value.mode === "full" &&
    value.deployment !== null &&
    (value.phase !== "complete" ||
      !["complete", "complete-with-errors"].includes(value.status) ||
      value.deployment.commit_sha !==
        value.publication?.checkpoint_commit_sha ||
      !Number.isInteger(value.deployment.run_id) ||
      value.deployment.run_id < 1 ||
      typeof value.deployment.verified_at !== "string")
  ) {
    throw new Error("full deployment state is invalid");
  }
  return createEnrichmentReport(value);
}
