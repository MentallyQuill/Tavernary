export function applyCatalogPolicyReviewState(
  previous: Record<string, any> | null,
  result: Record<string, any>,
): { action: "noop" | "write"; state: Record<string, any> };
