import type { TagProjectKind, TagVocabulary } from "./tag-vocabulary.mjs";

export type MetadataGenerationField = "summary" | "tags";

export type TagSelectionValidation =
  { valid: true } | { valid: false; errors: string[] };

export interface TagGenerationRequest {
  fields: MetadataGenerationField[];
  vocabulary: TagVocabulary;
  kind: TagProjectKind;
}

export interface GeneratedTagEvidence {
  id: string;
  evidence: string[];
}

export interface TagGenerationOutput {
  summary?: {
    value: string;
    evidence: string[];
  };
  tags?: GeneratedTagEvidence[];
}

export type TagGenerationValidation =
  | {
      valid: true;
      summary?: string;
      summaryEvidence?: string[];
      tags?: string[];
      evidence?: Record<string, string[]>;
    }
  | { valid: false; errors: string[] };

export function validateTagSelection(input: {
  tags: unknown;
  vocabulary: TagVocabulary;
  kind: TagProjectKind;
}): TagSelectionValidation;

export function validateTagGenerationOutput(
  output: unknown,
  request: TagGenerationRequest,
): TagGenerationValidation;
