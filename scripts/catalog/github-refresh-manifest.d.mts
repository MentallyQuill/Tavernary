export type RefreshMode = "incremental" | "baseline" | "project" | "forensic";
export type RefreshOutcome =
  | "unchanged"
  | "compare-source"
  | "compare-excluded"
  | "baseline"
  | "fallback"
  | "unavailable"
  | "identity-change"
  | "failed";

export interface ProjectRefreshOutcome {
  projectId: string;
  result: RefreshOutcome;
  durationMs: number;
  snapshotChanged?: boolean;
  evidenceStatus?: "provisional" | "complete" | "degraded";
  sourceHealth?: string;
  errorCode?: string | null;
  diagnostic?: string;
}

export interface GitHubRefreshManifest {
  schema_version: 1;
  mode: RefreshMode;
  started_at: string;
  completed_at: string;
  counts: {
    total: number;
    checked: number;
    changed: number;
    unchanged: number;
    provisional: number;
    degraded: number;
    unavailable: number;
    failed: number;
    compared: number;
    baseline: number;
    fallback: number;
  };
  api: {
    graphql_requests: number;
    graphql_points: number;
    graphql_remaining: number | null;
    rest_requests: number;
  };
  duration_ms: number;
  project_timings: Array<{
    project_id: string;
    outcome: RefreshOutcome;
    duration_ms: number;
    error_code: string | null;
  }>;
  snapshot_changes: boolean;
  deployment_requested: boolean;
}

export function buildRefreshManifest(run: {
  mode: RefreshMode;
  startedAt: string;
  completedAt: string;
  outcomes: ProjectRefreshOutcome[];
  snapshots?: unknown[];
  usage?: {
    graphqlRequests?: number;
    graphqlPoints?: number;
    graphqlRemaining?: number | null;
    restRequests?: number;
  };
  deploymentRequested?: boolean;
}): GitHubRefreshManifest;
