export type VocabularyEntry = {
  id: string;
  label?: string;
  description?: string;
};

export type ClassificationReviewRequest = {
  submittedPrimaryFunction: string;
  allowedPrimaryFunctions: readonly (string | VocabularyEntry)[];
};

export type ClassificationReview = null | {
  status: "confirmed" | "possible-mismatch";
  suggested_primary_function: string;
  explanation: string | null;
};

export type EnrichmentOutput = {
  summary: string;
  metadata_status: "curated";
  capabilities: string[];
  classification_review: ClassificationReview;
};

export type VocabularySet = {
  capabilities: ReadonlySet<string> | readonly (string | { id: string })[];
};

export function validateEnrichmentOutput(
  output: EnrichmentOutput,
  vocabularies: VocabularySet,
  classificationReviewRequest?: ClassificationReviewRequest | null,
): { valid: true } | { valid: false; errors: string[] };
