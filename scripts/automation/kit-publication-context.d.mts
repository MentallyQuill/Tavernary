import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { PreparedCurrentState } from "./prepared-result.mjs";
import type { CanonicalKit } from "../kits/apply-submission.mjs";
export function createPreparedKitRecord(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  now?: string;
}): CanonicalKit;
export function createKitPreparedPublicationContext(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  validators: Record<string, (value: unknown) => boolean>;
}): Promise<PreparedCurrentState>;
