import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
export interface ReconciliationAdmissionPlan {
  admissionKeys: readonly string[];
  orderedKeys: readonly string[];
  consumedKeys: readonly string[];
  consumedSubjects: readonly string[];
}
export interface ReconciliationInput {
  inventory: () => Promise<AutomationOperation[]>;
  dispatch: (operation: AutomationOperation) => Promise<{
    workerRunId?: number | null;
    operation?: AutomationOperation;
    waiting?: boolean;
  }>;
  persist: (receipt: AutomationReceipt) => Promise<void>;
  finalize?: (operation: AutomationOperation) => Promise<{
    operation: AutomationOperation;
    waiting?: boolean;
  }>;
  revalidate?: (
    operation: AutomationOperation,
  ) => Promise<AutomationOperation | null>;
  receipts?: AutomationReceipt[];
  admissionPlan?: ReconciliationAdmissionPlan;
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
