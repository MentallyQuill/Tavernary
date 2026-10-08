import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { SourceRecord } from "../../src/features/catalog/source-record.mjs";
import type { InventoryWorkerState } from "./inventory-worker.mjs";
import type { MetadataRecord, MetadataCache } from "./metadata-refresh.mjs";
export interface CatalogEvidence {
  source_id: string;
  repository?: { id: number; head_sha?: string };
  refreshed_at?: string;
  observed_at?: string;
  source_health?: string;
  contentDigest?: string;
}
export interface CatalogAdvisoryState {
  project_id: string;
  source_id: string;
  source_identity: string;
  evidence_fingerprint: string;
  policy_version: string;
  status: "clear" | "review-suggested" | "review-unavailable";
  reviewed_at: string;
  retry?: { attempts: number; last_failure_at: string | null };
  maintenance_issue_number?: number | null;
}
export interface CatalogInventoryInput extends InventoryWorkerState {
  catalog: {
    projects: MetadataRecord[];
    sources: SourceRecord[];
    revision?: string;
    vocabularyHash?: string;
  };
  evidence: CatalogEvidence[];
  advisoryState: CatalogAdvisoryState[];
  metadataState?: MetadataCache[];
  receipts: AutomationReceipt[];
  nowMs: number;
}
export function discoverCatalogOperations(
  input: CatalogInventoryInput,
): AutomationOperation[];
