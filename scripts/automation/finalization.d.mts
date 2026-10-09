import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
export interface FinalizationState {
  operations: AutomationOperation[];
  receipts: AutomationReceipt[];
  nowMs: number;
}
export function applyFinalizationReceipt(
  operation: AutomationOperation,
  receipts: AutomationReceipt[],
): AutomationOperation;
export function finalizeAutomationOperation<
  State extends FinalizationState,
>(input: {
  operationKey: string;
  load: () => Promise<State>;
  project: (
    operation: AutomationOperation,
    state: State,
  ) => Promise<{ status: "complete" | "superseded" | "waiting" }>;
  persist: (receipt: AutomationReceipt) => Promise<void>;
}): Promise<{
  status: "superseded" | "waiting" | "already-finalized" | "finalized";
}>;
