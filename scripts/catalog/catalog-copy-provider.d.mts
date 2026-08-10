import type {
  CatalogCopyMode,
  CatalogCopyResult,
} from "./catalog-copy-contract.mjs";
import type {
  JsonRepairMetadata,
  ProviderConfiguration,
} from "./enrichment-provider.mjs";

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
    jsonRepair?: JsonRepairMetadata;
  };
}

export function createCatalogCopyProvider(
  options: ProviderConfiguration & {
    jsonRepair?: ProviderConfiguration;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
  },
): {
  generate(input: CatalogCopyInput): Promise<CatalogCopyProviderResult>;
};
