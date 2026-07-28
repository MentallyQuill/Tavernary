import type {
  GitHubRefreshManifest,
  RefreshMode,
} from "./github-refresh-manifest.mjs";

export function selectRepositoryRefreshRecords(
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
    projectIds?: string[];
  },
): Array<{ id: string; [key: string]: unknown }>;

export function publishRepositoryCandidates(
  input: { changedSnapshots: any[]; manifest: GitHubRefreshManifest },
  options?: Record<string, unknown>,
): Promise<void>;

export function runRepositoryRefresh(options?: Record<string, any>): Promise<{
  selected: any[];
  snapshots: any[];
  changedSnapshots: any[];
  manifest: GitHubRefreshManifest;
}>;
