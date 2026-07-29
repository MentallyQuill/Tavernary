import type {
  GitHubRefreshManifest,
  RefreshMode,
} from "./github-refresh-manifest.mjs";

export function selectRefreshSources(
  records: Array<{
    id: string;
    type: string;
    refresh_policy: string;
  }>,
  snapshots: Array<{
    source_id: string;
    activity?: { evidence_status?: string };
  }>,
  options: {
    mode: RefreshMode;
    batchSize?: number;
    sourceId?: string | null;
    sourceIds?: string[];
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
