import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { commitCanonicalData } from "./canonical-data.mjs";
export function projectEnrichmentLifecycle(input: {
  operation: AutomationOperation;
  state: AutomationInventoryState;
  load: () => Promise<AutomationInventoryState>;
  commit: (
    input: Omit<Parameters<typeof commitCanonicalData>[0], "gh">,
  ) => Promise<{ sha: string }>;
}): Promise<{ status: "complete" | "superseded" | "waiting" }>;
