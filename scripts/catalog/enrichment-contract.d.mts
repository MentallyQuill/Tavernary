import type {
  CatalogCopyChangeReason,
  CatalogCopyPolicySignal,
  CatalogCopyResultStatus,
  CatalogCopyValidationContext,
} from "./catalog-copy-contract.mjs";

export type MetadataField = "summary" | "tags";

export type EvidenceBackedSummary = {
  value: string;
  evidence: string[];
};

export type EvidenceBackedTag = {
  id: string;
  evidence: string[];
};

export type EnrichmentOutput = {
  summary?: EvidenceBackedSummary;
  tags?: EvidenceBackedTag[];
  result?: CatalogCopyResultStatus;
  change_reasons?: readonly CatalogCopyChangeReason[];
  policy_signal?: CatalogCopyPolicySignal;
};

export type EnrichmentValidationContext = {
  requestedFields: readonly MetadataField[];
  kind: string;
  tagVocabulary: {
    tags: readonly {
      id: string;
      applicable_kinds: readonly string[];
    }[];
  };
  copyContext?: CatalogCopyValidationContext;
};

export function validateEnrichmentOutput(
  output: EnrichmentOutput,
  context: EnrichmentValidationContext,
): { valid: true } | { valid: false; errors: string[] };
