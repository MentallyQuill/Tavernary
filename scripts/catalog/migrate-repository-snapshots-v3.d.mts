import type { RepositorySnapshot } from "./repository-snapshot.mjs";

export interface RepositorySnapshotV2 {
  schema_version: 2;
  project_id: string;
  contributors?: {
    accounts: Array<{ login: string; type: string }>;
    [key: string]: unknown;
  };
  community: {
    stargazers_count: number;
    forks_count: number;
    subscribers_count: number;
    aggregate: number;
  };
  [key: string]: unknown;
}

export function migrateRepositorySnapshotV3(
  snapshot: RepositorySnapshotV2 | RepositorySnapshot,
): RepositorySnapshot;

export function migrateRepositorySnapshotsV3(options?: {
  directory?: string;
  write?: boolean;
}): Promise<string[]>;
