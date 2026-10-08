import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
export function persistPreparedFailure(input: {
  operationKey: string;
  error: unknown;
  load: () => Promise<AutomationInventoryState>;
  persist: (receipt: AutomationReceipt) => Promise<void>;
}): Promise<{ persisted: boolean; incident: boolean }>;
