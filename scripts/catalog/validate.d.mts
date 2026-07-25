export interface ValidationResult {
  projectCount: number;
  snapshotCount: number;
  kitCount: number;
  kitSnapshotCount: number;
  errors: string[];
}

export function validateCatalog(options?: {
  records?: unknown[];
  snapshots?: unknown[];
  refreshManifest?: unknown;
  kitRecords?: unknown[];
  supportSnapshots?: unknown[];
  blockedUsers?: unknown;
}): Promise<ValidationResult>;
