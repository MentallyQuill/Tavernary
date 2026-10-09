import type { AutomationInventoryState } from "./inventory.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { commitCanonicalData } from "./canonical-data.mjs";
export interface EnrichmentOwnerRequest {
  runId: number;
  sourceSha: string;
  scope: "pending" | "all-automatic";
  batchSize: number;
  concurrency: number;
}
export function parseEnrichmentOwnerRequest(
  run: unknown,
  repository?: string,
): EnrichmentOwnerRequest | null;
export function enrichmentRequestAncestor(
  root: string,
  ancestor: string,
  descendant: string,
): boolean | null;
export function admitEnrichmentOwnerRequest(input: {
  state: AutomationInventoryState;
  run: unknown;
  model: string;
  commit: (
    input: Omit<Parameters<typeof commitCanonicalData>[0], "gh">,
  ) => Promise<{ sha: string }>;
  isAncestor?: (ancestor: string, descendant: string) => boolean | null;
}): Promise<{ status: string; runId?: number; sha?: string; reason?: string }>;
export function loadLatestEnrichmentOwnerRequest(input: {
  gh: GhRunner;
  repository: string;
}): Promise<{ id: number } | null>;
