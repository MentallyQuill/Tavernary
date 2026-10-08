import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { PreparedCurrentState } from "./prepared-result.mjs";
import type {
  TavernKeeperReportIndexEntryV5,
  TavernKeeperScanReportV5,
} from "../security/tavernkeeper-reports.mjs";
export function createPreparedReportContext(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  readReport?: (
    entry: TavernKeeperReportIndexEntryV5,
  ) => Promise<TavernKeeperScanReportV5>;
  verifiedReports?: Map<string, TavernKeeperScanReportV5>;
}): Promise<PreparedCurrentState>;
