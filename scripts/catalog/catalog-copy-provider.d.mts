import type {
  CatalogCopyMode,
  CatalogCopyResult,
} from "./catalog-copy-contract.mjs";

export interface CatalogCopyEvidence {
  readme: { identity: string; text: string } | null;
  repositoryDescription: string | null;
  submissionDescription: string | null;
}

export interface CatalogCopyInput {
  mode: CatalogCopyMode;
  submittedSummary: string;
  evidence: CatalogCopyEvidence;
  protectedTerms: readonly string[];
  policyVersion: string;
  repair?: {
    reasonCode: string;
    message: string;
  };
}

export interface CatalogCopyProviderResult {
  output: CatalogCopyResult;
  metadata: {
    requestedModel: string;
    returnedModel: string | null;
    latencyMs: number;
  };
}

export function createCatalogCopyProvider(options: {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}): {
  generate(input: CatalogCopyInput): Promise<CatalogCopyProviderResult>;
};
