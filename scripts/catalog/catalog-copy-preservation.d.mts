import type {
  CatalogCopyChangeReason,
  CatalogCopyPolicySignal,
  CatalogCopyResult,
  CatalogCopyResultStatus,
} from "./catalog-copy-contract.mjs";

export interface ValidatedPreservedCatalogSummary {
  mode: "preserve";
  reviewStatus: "validated";
  submittedSummary: string;
  publishedSummary: string;
  copyResult: {
    result: CatalogCopyResultStatus;
    change_reasons: CatalogCopyChangeReason[];
    policy_signal: CatalogCopyPolicySignal;
  };
}

export interface UnavailablePreservedCatalogSummary {
  mode: "preserve";
  reviewStatus: "unavailable";
  reasonCode: "copy-review-unavailable";
  submittedSummary: string;
  publishedSummary: string;
  copyResult: null;
}

export type PreservedCatalogSummary =
  ValidatedPreservedCatalogSummary | UnavailablePreservedCatalogSummary;

export function preserveCatalogSummary(input: {
  authorityType: "repository-owner" | "tavernary-staff";
  submittedSummary: string;
  protectedTerms?: readonly string[];
  policyVersion?: string;
  copySummary?: (input: Record<string, unknown>) => Promise<CatalogCopyResult>;
}): Promise<PreservedCatalogSummary>;
