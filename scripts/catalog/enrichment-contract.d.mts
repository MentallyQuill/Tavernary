import type {
  CatalogCopyChangeReason,
  CatalogCopyMode,
  CatalogCopyPolicySignal,
  CatalogCopyResultStatus,
  CatalogCopyValidationContext,
} from "./catalog-copy-contract.mjs";

export interface ClassificationReviewRequest {
  submittedPrimaryFunction: string;
  allowedPrimaryFunctions: readonly (
    | string
    | {
        id: string;
        label?: string;
        description?: string;
      }
  )[];
}

export type ClassificationReview = null | {
  status: "confirmed" | "possible-mismatch";
  suggested_primary_function: string;
  explanation: string | null;
};

export type EnrichmentOutput = {
  summary: string;
  result: CatalogCopyResultStatus;
  change_reasons: readonly CatalogCopyChangeReason[];
  policy_signal: CatalogCopyPolicySignal;
  metadata_status: "curated";
  capabilities: string[];
  classification_review: ClassificationReview;
};

export type VocabularySet = {
  primaryFunctions?: ReadonlySet<string> | readonly (string | { id: string })[];
  capabilities: ReadonlySet<string> | readonly (string | { id: string })[];
};

export function validateEnrichmentOutput(
  output: EnrichmentOutput,
  vocabularies: VocabularySet,
  classificationReviewRequest?: ClassificationReviewRequest | null,
  copyContext?: CatalogCopyValidationContext,
): { valid: true } | { valid: false; errors: string[] };

export type { CatalogCopyMode };
