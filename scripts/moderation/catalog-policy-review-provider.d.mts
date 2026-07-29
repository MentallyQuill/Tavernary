import type { CatalogPolicyReviewOutput } from "./catalog-policy-review-contract.mjs";
export function catalogPolicyReviewInstructions(): string;
export function createCatalogPolicyReviewProvider(configuration: {
  apiUrl: string;
  apiKey: string;
  model: string;
}): {
  review(input: Record<string, any>): Promise<CatalogPolicyReviewOutput>;
};
