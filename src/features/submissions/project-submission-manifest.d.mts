export type ProjectSubmissionType = "frontend" | "extension" | "preset";

export interface OtherFrontendSubmission {
  name: string;
  url: string;
}

export interface ProjectSubmissionManifest {
  schema_version: 1;
  project_type: ProjectSubmissionType;
  source_url: string;
  name: string | null;
  description: string | null;
  frontends: {
    known_ids: string[];
    other: OtherFrontendSubmission[];
  };
  frontend_independent: boolean;
  additional_context: string | null;
}

export type ManifestValidation =
  | { valid: true; manifest: ProjectSubmissionManifest }
  | { valid: false; errors: string[] };

export function normalizeProjectSubmissionManifest(
  value: unknown,
): ManifestValidation;

export function serializeProjectSubmissionManifest(
  manifest: ProjectSubmissionManifest,
): string;
