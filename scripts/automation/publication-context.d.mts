import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { PreparedCurrentState } from "./prepared-result.mjs";
/** Fresh trusted-checkout and authoritative-inventory domain validation. */
export function createPreparedPublicationContext(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  /** Read-only preparation of a pinned trusted main base; never enables writes. */ preparation?: boolean;
}): Promise<PreparedCurrentState>;
