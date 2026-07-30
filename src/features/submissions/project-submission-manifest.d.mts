export type ProjectSubmissionType = "frontend" | "extension" | "preset";

export interface OtherFrontendSubmission {
  name: string;
  url: string;
}

export interface ProjectSubmissionManifest {
  schema_version: 4;
  project_type: ProjectSubmissionType;
  primary_function: string;
  source_url: string;
  frontends: {
    known_ids: string[];
    other: OtherFrontendSubmission[];
  };
  frontend_independent: boolean;
  additional_context: string | null;
  metadata: {
    summary: { mode: "automatic" } | { mode: "manual"; value: string };
    tags: { mode: "automatic" } | { mode: "manual"; values: string[] };
  };
  preset_compatibility?: {
    model_families: {
      known_ids: string[];
      other: string[];
    };
    completion_formats: string[];
  };
}

export type ManifestValidation =
  | { valid: true; manifest: ProjectSubmissionManifest }
  | { valid: false; errors: string[] };

export function normalizeProjectSubmissionManifest(
  value: unknown,
  options?: {
    allowLegacyV3?: boolean;
    tagVocabulary?: {
      tags: readonly {
        id: string;
        applicable_kinds: readonly string[];
      }[];
    };
  },
): ManifestValidation;

export function serializeProjectSubmissionManifest(
  manifest: ProjectSubmissionManifest,
): string;
