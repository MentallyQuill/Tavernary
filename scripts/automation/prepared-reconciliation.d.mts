import type { AutomationInventoryState } from "./inventory.mjs";
import type { PublicationResult } from "./publish.mjs";
import type { PreparedWake } from "./prepared-wake.mjs";
export function reconcilePreparedOperations(input: {
  state: AutomationInventoryState;
  hasResult: (wake: PreparedWake) => Promise<boolean>;
  publish: (wakes: PreparedWake[]) => Promise<PublicationResult>;
  limit?: number;
  onFailure?: (input: {
    operationKey: string;
    error: unknown;
  }) => Promise<void>;
}): Promise<{
  published: number;
  recovered: number;
  failures: number;
  consumedKeys: string[];
}>;
