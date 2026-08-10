import type { CatalogPolicyReviewOutput } from "./catalog-policy-review-contract.mjs";
import type { ProviderConfiguration } from "../catalog/enrichment-provider.mjs";
export function catalogPolicyReviewInstructions(): string;
export function createCatalogPolicyReviewProvider(
  configuration: ProviderConfiguration & {
    jsonRepair?: ProviderConfiguration;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
  },
): {
  review(input: Record<string, any>): Promise<CatalogPolicyReviewOutput>;
};
