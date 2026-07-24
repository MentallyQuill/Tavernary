export function migrateSnapshotV1(
  snapshot: Record<string, any>,
  now: string,
): Record<string, any>;

export interface SnapshotMigrationResult {
  total: number;
  migrated: number;
  unchanged: number;
  written: number;
}

export function migrateRepositorySnapshots(options?: {
  directory?: string;
  now?: string;
  write?: boolean;
}): Promise<SnapshotMigrationResult>;
