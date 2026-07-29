export interface IdentitySourceRecord {
  id: string;
  type: string;
  repository?: string;
  repository_id?: number | null;
  [key: string]: unknown;
}

export interface IdentitySnapshot {
  source_id: string;
  source_health: string;
  repository: {
    id: number;
    owner: string;
    name: string;
  };
  [key: string]: unknown;
}

export interface RepositoryIdentityBackfillResult {
  updated: IdentitySourceRecord[];
  conflicts: Array<{
    id: string;
    reason: "repository-name-mismatch" | "repository-id-mismatch";
    expected: string | number;
    received: string | number;
  }>;
  summary: {
    changed: number;
    skipped: number;
    conflicts: number;
  };
}

export function backfillRepositoryIdentities(
  records: IdentitySourceRecord[],
  snapshots: IdentitySnapshot[],
  options?: { sourceIds?: ReadonlySet<string> | null },
): RepositoryIdentityBackfillResult;
