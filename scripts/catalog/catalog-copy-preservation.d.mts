import type {
  CatalogCopyChangeReason,
  CatalogCopyPolicySignal,
  CatalogCopyResult,
  CatalogCopyResultStatus,
} from "./catalog-copy-contract.mjs";

export interface PreservedCatalogSummary {
  mode: "preserve";
  submittedSummary: string;
  publishedSummary: string;
  copyResult: {
    result: CatalogCopyResultStatus;
    change_reasons: CatalogCopyChangeReason[];
    policy_signal: CatalogCopyPolicySignal;
  };
}

export function preserveCatalogSummary(input: {
  authorityType: "repository-owner" | "tavernary-staff";
  submittedSummary: string;
  protectedTerms?: readonly string[];
  policyVersion?: string;
  copySummary?: (input: Record<string, unknown>) => Promise<CatalogCopyResult>;
}): Promise<PreservedCatalogSummary>;
