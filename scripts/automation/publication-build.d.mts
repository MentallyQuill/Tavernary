import type { AutomationInventoryState } from "./inventory.mjs";
import type { PreparedFile } from "./prepared-result.mjs";
import type { PublicationAction } from "./write-lane.mjs";
export function buildPreparedCatalogPublication(input: {
  action: Extract<PublicationAction, { action: "commit" }>;
  state: AutomationInventoryState;
}): Promise<PreparedFile[]>;
