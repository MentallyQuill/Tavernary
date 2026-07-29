export type OwnerOperation =
  | "edit-card"
  | "add-cards"
  | "retire-card"
  | "restore-card"
  | "move-source"
  | "delist-source";
export type OwnerProjectKind = "frontend" | "extension" | "preset";
export type OwnerMetadataMode = "automatic" | "manual";

export interface OwnerMetadataRequest {
  summary: { mode: OwnerMetadataMode };
  tags: { mode: OwnerMetadataMode };
}

export interface OwnerEditableValues {
  name: string;
  summary: string;
  frontends: string[];
  primary_function: string;
  tags: string[];
  metadata: OwnerMetadataRequest;
  model_families: string[];
  completion_formats: string[];
}

export interface OwnerCardOriginal extends OwnerEditableValues {
  kind: OwnerProjectKind;
}

export interface OwnerCardDraft extends OwnerEditableValues {
  draft_id: string;
  project_id: string;
  kind: OwnerProjectKind;
}

export interface OwnerSourceMove {
  repository: string;
  repository_id: number;
}

export interface OwnerCardState {
  listing_status: "active" | "retired";
  listing_status_reason: "removed" | null;
}

export interface OwnerSourceDelist {
  status: "delisted";
  status_reason: "removed";
  refresh_policy: "paused";
}

interface OwnerEnvelope<K extends OwnerOperation> {
  schema_version: 2;
  request_kind: "project-owner";
  operation: K;
  source_id: string;
  repository_id: number;
  explanation: string | null;
}

interface OwnerProjectEnvelope<K extends OwnerOperation>
  extends OwnerEnvelope<K> {
  project_id: string;
  project_fingerprint: string;
}

interface OwnerSourceEnvelope<K extends OwnerOperation>
  extends OwnerEnvelope<K> {
  source_fingerprint: string;
}

export interface OwnerEditCardManifest
  extends OwnerProjectEnvelope<"edit-card"> {
  original: OwnerCardOriginal;
  proposed: OwnerEditableValues;
}

export interface OwnerAddCardsManifest
  extends OwnerSourceEnvelope<"add-cards"> {
  proposed_cards: OwnerCardDraft[];
}

export interface OwnerRetireCardManifest
  extends OwnerProjectEnvelope<"retire-card"> {
  original: {
    listing_status: "active";
    listing_status_reason: null;
  };
  proposed: {
    listing_status: "retired";
    listing_status_reason: "removed";
  };
}

export interface OwnerRestoreCardManifest
  extends OwnerProjectEnvelope<"restore-card"> {
  original: {
    listing_status: "retired";
    listing_status_reason: "removed";
  };
  proposed: {
    listing_status: "active";
    listing_status_reason: null;
  };
}

export interface OwnerMoveSourceManifest
  extends OwnerSourceEnvelope<"move-source"> {
  original: OwnerSourceMove;
  proposed: OwnerSourceMove;
}

export interface OwnerDelistSourceManifest
  extends OwnerSourceEnvelope<"delist-source"> {
  original: { status: "active" };
  proposed: OwnerSourceDelist;
  delist_confirmation: string;
}

export type ProjectOwnerManifest =
  | OwnerEditCardManifest
  | OwnerAddCardsManifest
  | OwnerRetireCardManifest
  | OwnerRestoreCardManifest
  | OwnerMoveSourceManifest
  | OwnerDelistSourceManifest;

interface VocabularyEntry {
  id: string;
}

interface TagVocabularyEntry extends VocabularyEntry {
  applicable_kinds?: readonly OwnerProjectKind[];
}

type VocabularyInput<K extends string> =
  | readonly (string | VocabularyEntry)[]
  | { [P in K]: readonly VocabularyEntry[] };

export interface OwnerVocabularies {
  frontends: VocabularyInput<"frontends">;
  primaryFunctions: VocabularyInput<"primary_functions">;
  tags: VocabularyInput<"tags"> | readonly TagVocabularyEntry[];
  modelFamilies: VocabularyInput<"model_families">;
  completionFormats: VocabularyInput<"completion_formats">;
  source?: {
    id: string;
    type: "github";
    repository: string;
    repository_id: number;
  };
}

export type OwnerManifestValidation =
  | { valid: true; manifest: ProjectOwnerManifest }
  | { valid: false; errors: string[] };

export function normalizeProjectOwnerManifest(
  value: unknown,
  vocabularies: OwnerVocabularies,
): OwnerManifestValidation;
