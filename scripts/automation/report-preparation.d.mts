import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { TavernKeeperImportOptions } from "../security/import-tavernkeeper-reports.mjs";
export function acquirePreparedReportData(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  options?: Omit<
    TavernKeeperImportOptions,
    | "root"
    | "write"
    | "registry"
    | "batchSize"
    | "previousSnapshot"
    | "priorImportState"
    | "reportDigest"
    | "now"
  >;
}): Promise<Record<string, string>>;
