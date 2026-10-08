import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export function acquirePreparedKitData(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  gh?: GhRunner;
}): Promise<Record<string, string>>;
