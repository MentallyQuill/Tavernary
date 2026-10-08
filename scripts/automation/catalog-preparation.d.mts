import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { ModelPreparationOptions } from "./advisory-preparation.mjs";
import type {
  PreparedCurrentState,
  PreparedResult,
} from "./prepared-result.mjs";
export function assertCatalogPreparationContext(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  env: Record<string, string | undefined>;
}): PreparedResult["producer"];
export function acquireRefreshData(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  mode?: "project" | "forensic";
}): Promise<Record<string, string>>;
export function acquireCatalogData(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  mode?: "project" | "forensic";
  options?: ModelPreparationOptions;
}): Promise<Record<string, string>>;
export function prepareCatalogOperation(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  producer: PreparedResult["producer"];
  acquire?: (input: {
    state: AutomationInventoryState;
    operation: AutomationOperation;
  }) => Promise<Record<string, string>>;
  context?: (input: {
    state: AutomationInventoryState;
    operation: AutomationOperation;
    preparation: boolean;
  }) => Promise<PreparedCurrentState>;
}): Promise<PreparedResult | null>;
