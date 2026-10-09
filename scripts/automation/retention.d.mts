import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { PreparedFile } from "./prepared-result.mjs";
import type { CanonicalRemoval } from "./canonical-data.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export interface AutomationRetentionPlan {
  files: PreparedFile[];
  removeFiles: CanonicalRemoval[];
}
export function planAutomationRetention(input: {
  state: AutomationInventoryState;
  protectedSourceShas?: string[];
  pruneDeployments?: boolean;
}): AutomationRetentionPlan;
export function loadRetiredAutomationReceipts(input: {
  root: string;
  revision: string;
  operations: AutomationOperation[];
  nowMs: number;
}): Promise<AutomationReceipt[]>;
export function runAutomationStateRetention(input: {
  env: Record<string, string | undefined>;
  gh: GhRunner;
  load: () => Promise<AutomationInventoryState>;
  availableSlots: number;
  commit?: (
    input: AutomationRetentionPlan & {
      repository: string;
      expectedMainSha: string;
      message: string;
    },
  ) => Promise<{ sha: string }>;
}): Promise<
  | { status: "retired"; sha: string; removed: number }
  | { status: "idle" }
  | { status: "waiting"; reason: "operation-limit" }
>;
