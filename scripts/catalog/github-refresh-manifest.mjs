const RESULTS = new Set([
  "unchanged",
  "compare-source",
  "compare-excluded",
  "baseline",
  "fallback",
  "unavailable",
  "identity-change",
  "failed",
]);

function iso(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return date.toISOString();
}

function nonnegative(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

function safeCode(value) {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  return normalized.slice(0, 64) || null;
}

function count(outcomes, predicate) {
  return outcomes.filter(predicate).length;
}

export function buildRefreshManifest(run) {
  const startedAt = iso(run.startedAt, "refresh start");
  const completedAt = iso(run.completedAt, "refresh completion");
  const outcomes = Array.isArray(run.outcomes) ? run.outcomes : [];
  const usage = run.usage ?? {};
  const providerUsage = run.providers ?? {};

  for (const outcome of outcomes) {
    if (!RESULTS.has(outcome.result)) {
      throw new Error(`Unknown refresh outcome: ${outcome.result}`);
    }
  }

  const sourceTimings = outcomes.slice(0, 250).map((outcome) => ({
    source_id: String(outcome.sourceId),
    outcome: outcome.result,
    duration_ms: nonnegative(outcome.durationMs),
    error_code: safeCode(outcome.errorCode),
  }));
  const changed = count(outcomes, ({ snapshotChanged }) =>
    Boolean(snapshotChanged),
  );
  const stateSource = Array.isArray(run.snapshots) ? run.snapshots : outcomes;
  const evidenceStatus = (entry) =>
    entry.activity?.evidence_status ?? entry.evidenceStatus;
  const sourceHealth = (entry) =>
    entry.source_health ?? entry.sourceHealth ?? null;

  return {
    schema_version: 3,
    mode: run.mode,
    started_at: startedAt,
    completed_at: completedAt,
    counts: {
      total: outcomes.length,
      checked: outcomes.length,
      changed,
      unchanged: count(outcomes, ({ result }) => result === "unchanged"),
      provisional: count(
        stateSource,
        (entry) => evidenceStatus(entry) === "provisional",
      ),
      degraded: count(
        stateSource,
        (entry) => evidenceStatus(entry) === "degraded",
      ),
      unavailable: count(
        stateSource,
        (entry) =>
          sourceHealth(entry) === "unavailable" ||
          entry.result === "unavailable",
      ),
      failed: count(outcomes, ({ result }) => result === "failed"),
      compared: count(
        outcomes,
        ({ result }) =>
          result === "compare-source" || result === "compare-excluded",
      ),
      baseline: count(outcomes, ({ result }) => result === "baseline"),
      fallback: count(outcomes, ({ result }) => result === "fallback"),
    },
    api: {
      graphql_requests: nonnegative(usage.graphqlRequests),
      graphql_points: nonnegative(usage.graphqlPoints),
      graphql_remaining:
        usage.graphqlRemaining === null || usage.graphqlRemaining === undefined
          ? null
          : nonnegative(usage.graphqlRemaining),
      rest_requests: nonnegative(usage.restRequests),
    },
    providers: Object.fromEntries(
      ["github", "codeberg"].map((provider) => {
        const providerOutcomes = outcomes.filter(
          (outcome) => (outcome.provider ?? "github") === provider,
        );
        const providerState =
          providerUsage[provider] ??
          (provider === "github"
            ? {
                requests:
                  nonnegative(usage.graphqlRequests) +
                  nonnegative(usage.restRequests),
                remaining: usage.graphqlRemaining,
              }
            : {});
        return [
          provider,
          {
            checked: providerOutcomes.length,
            changed: count(
              providerOutcomes,
              ({ snapshotChanged, result }) =>
                result !== "failed" && Boolean(snapshotChanged),
            ),
            failed: count(
              providerOutcomes,
              ({ result }) => result === "failed",
            ),
            requests: nonnegative(providerState.requests),
            remaining:
              providerState.remaining === null ||
              providerState.remaining === undefined
                ? null
                : nonnegative(providerState.remaining),
          },
        ];
      }),
    ),
    duration_ms: Math.max(
      0,
      new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    ),
    source_timings: sourceTimings,
    snapshot_changes: changed > 0,
    deployment_requested: Boolean(run.deploymentRequested),
  };
}
