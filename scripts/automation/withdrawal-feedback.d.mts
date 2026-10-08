import type { AutomationInventoryState } from "./inventory.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export function synchronizeWithdrawalFeedback(input: {
  state: AutomationInventoryState;
  issueNumber: number;
  gh?: GhRunner;
}): Promise<void>;
