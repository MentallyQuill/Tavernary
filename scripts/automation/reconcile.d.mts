import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
export interface ReconciliationInput {
  inventory: () => Promise<AutomationOperation[]>;
  dispatch: (operation: AutomationOperation) => Promise<{
    workerRunId?: number | null;
    operation?: AutomationOperation;
    waiting?: boolean;
  }>;
  persist: (receipt: AutomationReceipt) => Promise<void>;
  revalidate?: (
    operation: AutomationOperation,
  ) => Promise<AutomationOperation | null>;
  receipts?: AutomationReceipt[];
  nowMs: number;
  limit?: number;
  dryRun?: boolean;
}
export interface ReconciliationResult {
  dispatched: number;
  waiting: number;
  finished: number;
  incidents: number;
  permanentFailures: number;
  selectedKeys: string[];
}
export function reconcileAutomation(
  input: ReconciliationInput,
): Promise<ReconciliationResult>;
