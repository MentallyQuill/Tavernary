import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { TavernKeeperImportState } from "../security/tavernkeeper-import-state.mjs";
import type {
  TavernKeeperReportIndexV5,
  TavernKeeperSourceRegistryEntry,
} from "../security/tavernkeeper-reports.mjs";
import type { InventoryWorkerState } from "./inventory-worker.mjs";
export interface ReportInventoryInput extends InventoryWorkerState {
  reportIndex: TavernKeeperReportIndexV5;
  registry: TavernKeeperSourceRegistryEntry[];
  importState: TavernKeeperImportState;
  importedReports: Array<{
    report_digest: string;
    repository_id: number;
    target_sha: string;
    synthesis_policy_version: string;
  }>;
  receipts: AutomationReceipt[];
  nowMs: number;
}
export function discoverReportOperations(
  input: ReportInventoryInput,
): AutomationOperation[];
export function reportOperationDigest(operation: AutomationOperation): string;
export function isReportNarrativeRetry(operation: AutomationOperation): boolean;
