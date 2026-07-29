export interface ValidationResult {
  projectCount: number;
  snapshotCount: number;
  kitCount: number;
  kitSnapshotCount: number;
  errors: string[];
}

export function validateCatalog(options?: {
  records?: unknown[];
  sources?: unknown[];
  snapshots?: unknown[];
  refreshManifest?: unknown;
  kitRecords?: unknown[];
  supportSnapshots?: unknown[];
  blockedUsers?: unknown;
  trustedEditors?: unknown;
}): Promise<ValidationResult>;
