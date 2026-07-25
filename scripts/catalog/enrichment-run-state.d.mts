export type AttemptOutcome =
  | "enriched"
  | "fallback"
  | "source-not-ready"
  | "retry-pending"
  | "retry-enriched"
  | "retry-fallback"
  | "final-failure"
  | "skipped";

export type ProjectAttemptResult = {
  id: string;
  phase: "primary" | "retry";
  outcome: "enriched" | "fallback" | "source-not-ready" | "failed" | "skipped";
  sourceKind?: "description" | "readme" | "confirmed-fallback";
  repositoryId?: number;
  headSha?: string;
  readmePath?: string | null;
  readmeRef?: string | null;
  provider?: {
    requestedModel: "MiniMax-M3";
    returnedModel: string | null;
    latencyMs: number;
  };
  reasonCode?: string;
  message?: string;
};

export type EnrichmentRunEntry = {
  id: string;
  attempt: 1 | 2;
  phase: "primary" | "retry";
  outcome: AttemptOutcome;
  completed_at: string;
  [key: string]: unknown;
};

export type EnrichmentRunState = {
  schema_version: 1;
  run_id: string;
  mode: "canary" | "full";
  status: "running" | "awaiting-deployment" | "passed" | "failed" | "complete";
  phase: "primary" | "retry" | "complete";
  expected_model: "MiniMax-M3";
  batch_size: number;
  concurrency: number;
  created_at: string;
  updated_at: string;
  manifest: readonly string[];
  primary_cursor: number;
  retry_queue: string[];
  retry_cursor: number;
  attempts: Record<string, number>;
  entries: Record<string, EnrichmentRunEntry>;
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
  batchSize?: number;
  concurrency?: number;
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

export function assertSuccessfulCanaryEntries(state: EnrichmentRunState): void;

export function approveCanaryDeployment(
  state: EnrichmentRunState,
  input: {
    commitSha: string;
    deploymentRunId: number;
    now: string;
  },
): EnrichmentRunState;

export function assertFullRolloutAllowed(previous: EnrichmentRunState): void;
