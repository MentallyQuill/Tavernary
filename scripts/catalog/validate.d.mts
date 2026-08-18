export interface ValidationResult {
  projectCount: number;
  snapshotCount: number;
  installEvidenceCount?: number;
  kitCount: number;
  kitSnapshotCount: number;
  errors: string[];
}

export function validateCatalog(options?: {
  records?: unknown[];
  sources?: unknown[];
  snapshots?: unknown[];
  installEvidence?: unknown[];
  refreshManifest?: unknown;
  kitRecords?: unknown[];
  supportSnapshots?: unknown[];
  blockedUsers?: unknown;
  trustedEditors?: unknown;
  tagVocabulary?: unknown;
}): Promise<ValidationResult>;
