export type OwnerOperation = "edit-card" | "move-source" | "delist";
export type OwnerProjectKind = "frontend" | "extension" | "preset";

export interface OwnerEditableValues {
  name: string;
  summary: string;
  frontends: string[];
  primary_function: string;
  capabilities: string[];
  model_families: string[];
  completion_formats: string[];
}

export interface OwnerCardOriginal extends OwnerEditableValues {
  kind: OwnerProjectKind;
}

export type OwnerCardEdit = OwnerEditableValues;

export interface OwnerSourceMove {
  repository: string;
  repository_id: number;
}

export interface OwnerDelist {
  visibility: "disabled";
  visibility_reason: "removed";
  refresh_policy: "paused";
  enrichment_policy: "manual";
}

export interface OwnerEnvelope<
  K extends string,
  P,
  R extends number | null = number | null,
> {
  schema_version: 1;
  request_kind: "project-owner";
  operation: K;
  project_id: string;
  repository_id: R;
  source_fingerprint: string;
  original: Record<string, unknown>;
  proposed: P;
  explanation: string | null;
}

export interface OwnerDelistEnvelope extends OwnerEnvelope<
  "delist",
  OwnerDelist
> {
  delist_confirmation: string;
}

export type ProjectOwnerManifest =
  | OwnerEnvelope<"edit-card", OwnerCardEdit>
  | OwnerEnvelope<"move-source", OwnerSourceMove, number>
  | OwnerDelistEnvelope;

export interface OwnerVocabularies {
  frontends:
    | readonly (string | { id: string })[]
    | { frontends: readonly { id: string }[] };
  primaryFunctions:
    | readonly (string | { id: string })[]
    | { primary_functions: readonly { id: string }[] };
  capabilities:
    | readonly (string | { id: string })[]
    | { capabilities: readonly { id: string }[] };
  modelFamilies:
    | readonly (string | { id: string })[]
    | { model_families: readonly { id: string }[] };
  completionFormats:
    | readonly (string | { id: string })[]
    | { completion_formats: readonly { id: string }[] };
}

export type OwnerManifestValidation =
  | { valid: true; manifest: ProjectOwnerManifest }
  | { valid: false; errors: string[] };

export function normalizeProjectOwnerManifest(
  value: unknown,
  vocabularies: OwnerVocabularies,
): OwnerManifestValidation;
