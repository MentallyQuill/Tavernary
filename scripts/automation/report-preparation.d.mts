import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { TavernKeeperImportOptions } from "../security/import-tavernkeeper-reports.mjs";
import type { ModelPreparationOptions } from "./advisory-preparation.mjs";
export function acquirePreparedReportData(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  options?: ModelPreparationOptions &
    Omit<
      TavernKeeperImportOptions,
      | "root"
      | "write"
      | "registry"
      | "batchSize"
      | "previousSnapshot"
      | "priorImportState"
      | "reportDigest"
      | "retryReportDigest"
      | "now"
    >;
}): Promise<Record<string, string>>;
