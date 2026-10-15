import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { PreparedDiagnosticEvidence } from "./prepared-github.mjs";
export function isPreparedDiagnosticObsolete(input: {
  state: AutomationInventoryState;
  evidence: PreparedDiagnosticEvidence;
}): boolean;
export function persistPreparedFailure(input: {
  operationKey: string;
  error: unknown;
  phase?: "finalization";
  generationRequest?: import("./preparation-request.mjs").GenerationOwnerRequest;
  isRequestAncestor?: (ancestor: string, descendant: string) => boolean | null;
  load: () => Promise<AutomationInventoryState>;
  persist: (receipt: AutomationReceipt) => Promise<void>;
}): Promise<{ persisted: boolean; incident: boolean }>;
