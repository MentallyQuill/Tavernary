export interface ValidationResult {
  projectCount: number;
  snapshotCount: number;
  errors: string[];
}

export function validateCatalog(options?: {
  records?: unknown[];
  snapshots?: unknown[];
  refreshManifest?: unknown;
}): Promise<ValidationResult>;
