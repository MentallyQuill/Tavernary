import type {
  GitHubRefreshManifest,
  RefreshMode,
} from "./github-refresh-manifest.mjs";

export function formatSnapshot(snapshot: unknown): Promise<string>;
export function publishCandidates(
  input: { changedSnapshots: unknown[]; manifest: unknown },
  options?: {
    snapshotDirectory?: string;
    manifestPath?: string;
    rename?: (from: string, to: string) => Promise<void>;
  },
): Promise<void>;
export function selectRefreshRecords(
  records: Array<{
    id: string;
    source: { type: string };
    refresh_policy: string;
  }>,
  snapshots: Array<{
    project_id: string;
    activity?: { evidence_status?: string };
  }>,
  options: {
    mode: RefreshMode;
    batchSize?: number;
    projectId?: string | null;
  },
): Array<{ id: string; [key: string]: unknown }>;
export function snapshotForFailure<T>(
  previous: T | null,
  error: { status?: number },
  now: string,
  options?: { baselineAttempt?: boolean },
): T | null;
export function repositoryIdentityChanged(
  record: { source: { repository_id: number | null } },
  observation: { repository: { id: number } },
): boolean;
export function runRefresh(options?: Record<string, unknown>): Promise<{
  selected: Array<{ id: string; [key: string]: unknown }>;
  snapshots: Array<{
    repository: {
      head_sha: string;
      description?: string | null;
      [key: string]: unknown;
    };
    activity: {
      source_weeks: Array<{
        week_start: string;
        latest_at: string;
        precision: "exact" | "interval";
      }>;
      evidence_status: "provisional" | "complete" | "degraded";
      baseline_attempts: number;
      [key: string]: unknown;
    };
    stale_since: string | null;
    [key: string]: unknown;
  }>;
  changedSnapshots: unknown[];
  manifest: GitHubRefreshManifest;
}>;
