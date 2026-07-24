interface IdentityRecord {
  id: string;
  source: {
    type: string;
    repository?: string;
    repository_id?: number | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface IdentitySnapshot {
  project_id: string;
  source_health: string;
  repository: {
    id: number;
    owner: string;
    name: string;
  };
  [key: string]: unknown;
}

export function backfillRepositoryIdentities(
  records: IdentityRecord[],
  snapshots: IdentitySnapshot[],
): {
  updated: IdentityRecord[];
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
};
