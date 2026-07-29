export type CatalogPolicyReviewCategory =
  | "potential-hate-or-discrimination"
  | "potential-sexual-content-involving-minors"
  | "potential-other-catalog-policy-conflict";
export interface CatalogPolicyReviewOutput {
  status: "clear" | "review-suggested" | "review-unavailable";
  category: CatalogPolicyReviewCategory | null;
  explanation: string | null;
}
export const CATALOG_POLICY_REVIEW_CATEGORIES: readonly CatalogPolicyReviewCategory[];
export function createPolicyEvidenceFingerprint(input: {
  projectId: string;
  sourceId: string;
  headSha: string;
  policyVersion: string;
}): string;
export function validateCatalogPolicyReviewOutput(
  output: unknown,
):
  | { valid: true; value: CatalogPolicyReviewOutput }
  | { valid: false; errors: string[] };
