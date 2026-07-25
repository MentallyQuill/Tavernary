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
    expected_model: "MiniMax-M3",
    batch_size: state.batch_size,
    concurrency: state.concurrency,
    created_at: state.created_at,
    updated_at: state.updated_at,
    manifest: [...state.manifest],
    primary_cursor: state.primary_cursor,
    retry_queue: [...state.retry_queue],
    retry_cursor: state.retry_cursor,
    attempts: Object.fromEntries(
      Object.entries(state.attempts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    entries,
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

export function validateEnrichmentReport(value) {
  if (!value || typeof value !== "object" || value.schema_version !== 1) {
    throw new Error("enrichment report schema is invalid");
  }
  if (value.expected_model !== "MiniMax-M3") {
    throw new Error("enrichment report must use MiniMax-M3");
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
    ].includes(value.status)
  ) {
    throw new Error("enrichment report status is invalid");
  }
  assertUnique(value.manifest, "manifest");
  assertUnique(value.retry_queue, "retry queue");
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
  return createEnrichmentReport(value);
}
