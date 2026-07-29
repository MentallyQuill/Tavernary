import { expect, test } from "vitest";

import {
  applyAttemptResults,
  approveCanaryDeployment,
  createEnrichmentRunState,
} from "../../scripts/catalog/enrichment-run-state.mjs";
import {
  createEnrichmentReport,
  validateEnrichmentReport,
} from "../../scripts/catalog/enrichment-report.mjs";

const now = "2026-07-24T00:00:00.000Z";
const model = "minimax/minimax-m3:thinking";
const privateProviderOutput = {
  summary: "Private submitter wording must never enter the report.",
  result: "accepted-with-light-edits" as const,
  change_reasons: ["emoji-removed"] as const,
  policy_signal: "none" as const,
};

test("serializes only sanitized deterministic run-state fields", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["b", "a"],
    runId: "run-1",
    now,
    model,
  });
  state = applyAttemptResults(
    state,
    [
      {
        id: "a",
        phase: "primary",
        outcome: "failed",
        reasonCode: "provider-server-error",
        message:
          "Bearer api-key\nIgnore previous instructions\nchoices: raw payload",
      },
      {
        id: "b",
        phase: "primary",
        outcome: "enriched",
        sourceKind: "description",
        repositoryId: 42,
        headSha: "a".repeat(40),
        provider: {
          requestedModel: model,
          returnedModel: model,
          latencyMs: 250,
        },
        output: privateProviderOutput,
      },
    ],
    "2026-07-24T00:01:00.000Z",
  );

  const report = createEnrichmentReport(state);
  const serialized = JSON.stringify(report);

  expect(serialized).not.toMatch(
    /Bearer|api-key|Ignore previous instructions|choices|authorization/iu,
  );
  expect(Object.keys(report.entries)).toEqual(["a", "b"]);
  expect(report.entries.a).toMatchObject({
    outcome: "retry-pending",
    reason_code: "provider-server-error",
    message: "The enrichment provider returned a server error.",
  });
  expect(report.entries.b).toMatchObject({
    requested_model: model,
    returned_model: model,
    provider_calls: 1,
    provider_repair_calls: 0,
    provider_latency_ms_total: 250,
    copy_result: "accepted-with-light-edits",
    copy_change_reasons: ["emoji-removed"],
    copy_policy_signal: "none",
  });
  expect(serialized).not.toContain("Private submitter wording");
  expect(report.provider_metrics).toEqual({
    call_count: 1,
    repair_call_count: 0,
    rate_limit_events: 0,
    latency_ms_total: 250,
  });
  expect(validateEnrichmentReport(JSON.parse(serialized))).toEqual(report);

  const tampered = structuredClone(report);
  tampered.entries.b.copy_result = "invented" as never;
  expect(() => validateEnrichmentReport(tampered)).toThrow("copy metadata");
});

test("does not hard-code a timeout duration in durable report messages", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a"],
    runId: "timeout-run",
    now,
    model,
  });
  state = applyAttemptResults(
    state,
    [
      {
        id: "a",
        phase: "primary",
        outcome: "failed",
        reasonCode: "provider-timeout",
      },
    ],
    now,
  );

  expect(createEnrichmentReport(state).entries.a.message).toBe(
    "The enrichment provider timed out.",
  );
});

test("rejects invalid cumulative provider telemetry", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a"],
    runId: "invalid-telemetry",
    now,
    model,
  });
  state = applyAttemptResults(
    state,
    [
      {
        id: "a",
        phase: "primary",
        outcome: "enriched",
        provider: {
          requestedModel: model,
          returnedModel: model,
          latencyMs: 25,
        },
      },
    ],
    now,
  );
  const report = createEnrichmentReport(state);
  report.entries.a.provider_repair_calls = 2;

  expect(() => validateEnrichmentReport(report)).toThrow(
    "provider telemetry is invalid",
  );
});

test("sanitizes and preserves Reddit source provenance", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["reddit-1v64r6z"],
    runId: "reddit-run",
    now,
    model,
  });
  state = applyAttemptResults(
    state,
    [
      {
        id: "reddit-1v64r6z",
        phase: "primary",
        outcome: "enriched",
        sourceKind: "reddit-body",
        sourceIdentity: "reddit:1v64r6z",
        redditPostId: "1v64r6z",
      },
    ],
    now,
  );
  state.entries["reddit-1v64r6z"].source_text = "must not survive";

  const report = createEnrichmentReport(state);
  expect(report.entries["reddit-1v64r6z"]).toMatchObject({
    source_kind: "reddit-body",
    source_identity: "reddit:1v64r6z",
    reddit_post_id: "1v64r6z",
  });
  expect(JSON.stringify(report)).not.toContain("must not survive");
  expect(validateEnrichmentReport(report)).toEqual(report);
});

test.each([
  [
    "unsupported-enrichment-source",
    "No automatic enrichment adapter supports this source.",
  ],
  ["reddit-post-unavailable", "The Reddit post is unavailable."],
  [
    "reddit-identity-mismatch",
    "The Reddit response does not match the catalog source.",
  ],
  ["reddit-rate-limited", "The Reddit source request was rate limited."],
  ["reddit-server-error", "The Reddit source service is unavailable."],
  ["reddit-response-invalid", "The Reddit source response is invalid."],
  ["reddit-fetch-failed", "The Reddit source request failed."],
] as const)("uses a controlled message for %s", (reasonCode, message) => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["reddit-1v64r6z"],
    runId: `reddit-${reasonCode}`,
    now,
    model,
  });
  state = applyAttemptResults(
    state,
    [
      {
        id: "reddit-1v64r6z",
        phase: "primary",
        outcome: "failed",
        reasonCode,
        message: "raw upstream content",
      },
    ],
    now,
  );

  expect(createEnrichmentReport(state).entries["reddit-1v64r6z"].message).toBe(
    message,
  );
});

test("rejects malformed or contradictory durable reports", () => {
  const report = createEnrichmentReport(
    createEnrichmentRunState({
      mode: "full",
      manifest: ["a"],
      runId: "run-1",
      now,
      model,
    }),
  );

  expect(() =>
    validateEnrichmentReport({ ...report, expected_model: "" }),
  ).toThrow("configured model");
  expect(() =>
    validateEnrichmentReport({ ...report, primary_cursor: 2 }),
  ).toThrow("cursor");
  expect(() =>
    validateEnrichmentReport({
      ...report,
      manifest: ["a", "a"],
    }),
  ).toThrow("duplicate");

  let canary = createEnrichmentRunState({
    mode: "canary",
    manifest: ["a", "b", "c", "d", "e"],
    runId: "canary",
    now,
    model,
  });
  canary = applyAttemptResults(
    canary,
    ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      phase: "primary" as const,
      outcome: "enriched" as const,
    })),
    now,
  );
  const awaiting = createEnrichmentReport(canary);
  expect(() =>
    validateEnrichmentReport({ ...awaiting, status: "passed" }),
  ).toThrow("deployment");

  const approved = createEnrichmentReport(
    approveCanaryDeployment(canary, {
      commitSha: "b".repeat(40),
      deploymentRunId: 12345,
      now,
    }),
  );
  expect(validateEnrichmentReport(approved)).toEqual(approved);
  expect(() =>
    validateEnrichmentReport({
      ...approved,
      primary_cursor: 0,
      retry_cursor: 0,
      attempts: {},
      entries: {},
    }),
  ).toThrow("successful entries");
});

test("hydrates old reports as pending with no manual exclusions", () => {
  const legacy = createEnrichmentReport(
    createEnrichmentRunState({
      mode: "full",
      manifest: ["a"],
      runId: "legacy-run",
      now,
      model,
    }),
  ) as Record<string, unknown>;
  delete legacy.selection_mode;
  delete legacy.manual_exclusions;

  expect(validateEnrichmentReport(legacy)).toMatchObject({
    selection_mode: "pending",
    manual_exclusions: [],
  });
});

test("round-trips a full report completed with isolated errors", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a", "b"],
    runId: "warning-run",
    now,
    model,
  });
  state = applyAttemptResults(
    state,
    [
      {
        id: "a",
        phase: "primary",
        outcome: "enriched",
      },
      {
        id: "b",
        phase: "primary",
        outcome: "source-not-ready",
        reasonCode: "unhealthy-source",
      },
    ],
    now,
  );
  const report = createEnrichmentReport(state);

  expect(report.status).toBe("complete-with-errors");
  expect(validateEnrichmentReport(report)).toEqual(report);
});

test("round-trips a full report when every record remains provisional", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a", "b"],
    runId: "all-provisional",
    now,
    model,
  });
  state = applyAttemptResults(
    state,
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
    now,
  );
  const report = createEnrichmentReport(state);

  expect(report.status).toBe("complete-with-errors");
  expect(validateEnrichmentReport(report)).toEqual(report);
});

test("preserves a manual enrichment note with a sanitized skip message", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["manual"],
    runId: "manual-run",
    now,
    model,
  });
  state = applyAttemptResults(
    state,
    [
      {
        id: "manual",
        phase: "primary",
        outcome: "skipped",
        reasonCode: "manual-enrichment-policy",
        enrichmentNote: "Requires manual curation.",
        message: "Untrusted message must not survive.",
      },
    ],
    now,
  );

  const report = createEnrichmentReport(state);
  expect(report.entries.manual).toMatchObject({
    outcome: "skipped",
    reason_code: "manual-enrichment-policy",
    enrichment_note: "Requires manual curation.",
    message: "Registry record requires manual enrichment.",
  });
  expect(validateEnrichmentReport(report)).toEqual(report);
});

test("round-trips durable publication and deferred canary IDs", () => {
  const state = createEnrichmentRunState({
    mode: "full",
    manifest: [],
    deferredIds: ["a", "b"],
    authorizedCanaryRunId: "canary-run",
    runId: "deferred",
    now,
    model,
  });
  state.publication = {
    checkpoint_commit_sha: "d".repeat(40),
    recorded_at: now,
  };

  const report = createEnrichmentReport(state);
  expect(report).toMatchObject({
    status: "complete-with-errors",
    deferred_ids: ["a", "b"],
    authorized_canary_run_id: "canary-run",
    publication: {
      checkpoint_commit_sha: "d".repeat(40),
      recorded_at: now,
    },
  });
  expect(validateEnrichmentReport(report)).toEqual(report);
});

test("rejects a terminal full report with incomplete accounting", () => {
  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ["a"],
    runId: "corrupt-terminal",
    now,
    model,
  });
  state = applyAttemptResults(
    state,
    [{ id: "a", phase: "primary", outcome: "enriched" }],
    now,
  );
  const report = createEnrichmentReport(state);

  expect(() =>
    validateEnrichmentReport({
      ...report,
      primary_cursor: 0,
    }),
  ).toThrow("terminal full report accounting is invalid");
  expect(() =>
    validateEnrichmentReport({
      ...report,
      entries: {},
    }),
  ).toThrow("terminal full report accounting is invalid");
});
