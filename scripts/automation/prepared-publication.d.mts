import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type {
  PreparedCurrentState,
  PreparedResult,
  PreparedFile,
  TrustedPreparationRun,
} from "./prepared-result.mjs";
import type { PublicationAction } from "./write-lane.mjs";
import type { PublicationResult } from "./publish.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
export function publishPreparedOperation(input: {
  operationKey: string;
  runId: number;
  load: () => Promise<AutomationInventoryState>;
  context: (
    state: AutomationInventoryState,
    operation: AutomationOperation,
  ) => Promise<PreparedCurrentState>;
  loadResult: (input: {
    inventory: AutomationInventoryState;
    operation: AutomationOperation;
    currentState: PreparedCurrentState;
    runId: number;
  }) => Promise<{ result: PreparedResult; run: TrustedPreparationRun }>;
  build: (
    action: Extract<PublicationAction, { action: "commit" }>,
    state: AutomationInventoryState,
  ) => Promise<PreparedFile[]>;
  commit: (
    action: Extract<PublicationAction, { action: "commit" }>,
    state: AutomationInventoryState,
  ) => Promise<{ sha: string }>;
  persist: (receipt: AutomationReceipt) => Promise<void>;
}): Promise<PublicationResult>;
