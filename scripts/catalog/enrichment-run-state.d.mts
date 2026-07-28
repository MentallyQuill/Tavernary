export type AttemptOutcome =
  | "enriched"
  | "fallback"
  | "source-not-ready"
  | "retry-pending"
  | "retry-enriched"
  | "retry-fallback"
  | "final-failure"
  | "skipped";

export type EnrichmentSelectionMode = "pending" | "all-automatic";

export type ManualEnrichmentExclusion = {
  id: string;
  reason_code: "manual-enrichment-policy";
  enrichment_note: string;
};

export type ProjectAttemptResult = {
  id: string;
  phase: "primary" | "retry";
  outcome: "enriched" | "fallback" | "source-not-ready" | "failed" | "skipped";
  sourceKind?:
    | "description"
    | "readme"
    | "reddit-body"
    | "reddit-title"
    | "confirmed-fallback";
  sourceIdentity?: string;
  repositoryId?: number;
  headSha?: string;
  readmePath?: string | null;
  readmeRef?: string | null;
  redditPostId?: string;
  provider?: {
    requestedModel: string;
    returnedModel: string | null;
    latencyMs: number;
  };
  providerCallCount?: number;
  providerRepairCallCount?: number;
  providerRateLimitCount?: number;
  providerLatencyMsTotal?: number;
  reasonCode?: string;
  enrichmentNote?: string;
  diagnosticCode?: string | null;
  repairHint?: string;
  message?: string;
};

export type EnrichmentRunEntry = {
  id: string;
  attempt: 1 | 2;
  phase: "primary" | "retry";
  outcome: AttemptOutcome;
  completed_at: string;
  provider_calls?: number;
  provider_repair_calls?: number;
  provider_rate_limit_events?: number;
  provider_latency_ms_total?: number;
  [key: string]: unknown;
};

export type EnrichmentRunState = {
  schema_version: 1;
  run_id: string;
  mode: "canary" | "full";
  status:
    | "running"
    | "awaiting-deployment"
    | "passed"
    | "failed"
    | "complete"
    | "complete-with-errors";
  phase: "primary" | "retry" | "complete";
  expected_model: string;
  selection_mode: EnrichmentSelectionMode;
  manual_exclusions: readonly ManualEnrichmentExclusion[];
  batch_size: number;
  concurrency: number;
  created_at: string;
  updated_at: string;
  manifest: readonly string[];
  deferred_ids: readonly string[];
  authorized_canary_run_id: string | null;
  primary_cursor: number;
  retry_queue: string[];
  retry_cursor: number;
  attempts: Record<string, number>;
  entries: Record<string, EnrichmentRunEntry>;
  publication: {
    checkpoint_commit_sha: string;
    recorded_at: string;
  } | null;
  deployment: {
    commit_sha: string;
    run_id: number;
    verified_at: string;
  } | null;
  aggregates: Record<AttemptOutcome, number>;
};

export function createEnrichmentRunState(input: {
  mode: "canary" | "full";
  manifest: string[];
  runId: string;
  now: string;
  model: string;
  batchSize?: number;
  concurrency?: number;
  deferredIds?: string[];
  authorizedCanaryRunId?: string;
  selectionMode?: EnrichmentSelectionMode;
  manualExclusions?: ManualEnrichmentExclusion[];
}): EnrichmentRunState;

export function selectNextRunBatch(state: EnrichmentRunState): {
  phase: "primary" | "retry";
  projectIds: string[];
  attempt: 1 | 2;
};

export function applyAttemptResults(
  state: EnrichmentRunState,
  results: ProjectAttemptResult[],
  now: string,
): EnrichmentRunState;

export function recordCheckpointPublication(
  state: EnrichmentRunState,
  input: {
    commitSha: string;
    now: string;
  },
): EnrichmentRunState;

export function recordFullDeployment(
  state: EnrichmentRunState,
  input: {
    commitSha: string;
    deploymentRunId: number;
    now: string;
  },
): EnrichmentRunState;

export function assertSuccessfulCanaryEntries(state: EnrichmentRunState): void;

export function failureScope(
  reasonCode: string | undefined,
): "systemic" | "isolated";

export function approveCanaryDeployment(
  state: EnrichmentRunState,
  input: {
    commitSha: string;
    deploymentRunId: number;
    now: string;
  },
): EnrichmentRunState;

export function assertFullRolloutAllowed(
  previous: EnrichmentRunState,
  model: string,
  selectionMode?: EnrichmentSelectionMode,
): void;
