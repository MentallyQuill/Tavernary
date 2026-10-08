import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { PreparedCurrentState } from "./prepared-result.mjs";
import type { EnrichmentReport } from "../catalog/enrichment-report.mjs";
import type { EnrichmentSource } from "../catalog/enrichment-source.mjs";
import type {
  RegistryRecord,
  SourceRecord,
  RepositorySnapshot,
  RunCliOptions,
} from "../catalog/enrich-readmes.mjs";
import type { ModelBudgetGuard } from "./model-budget.mjs";
export interface EnrichmentCheckpointInput {
  state: AutomationInventoryState;
  operation: AutomationOperation;
}
export type EnrichmentCheckpointObserver = (input: {
  state: AutomationInventoryState;
  project: RegistryRecord;
  source: SourceRecord;
  snapshot: RepositorySnapshot;
}) => Promise<{ source: EnrichmentSource }>;
export function hasConfirmedEnrichmentCanary(
  state: AutomationInventoryState,
  full: EnrichmentReport,
): boolean;
export function discoverEnrichmentOperations(
  state: AutomationInventoryState,
): AutomationOperation[];
export function enrichmentCheckpointNeedsModel(
  input: EnrichmentCheckpointInput & {
    observe?: EnrichmentCheckpointObserver;
    model?: string;
  },
): Promise<boolean>;
export function acquirePreparedEnrichmentData(
  input: EnrichmentCheckpointInput & {
    options?: {
      env?: Record<string, string | undefined>;
      provider?: RunCliOptions["provider"];
      providerConfiguration?: RunCliOptions["providerConfiguration"];
      observe?: EnrichmentCheckpointObserver;
      budgetGuard?: () => Promise<ModelBudgetGuard>;
    };
  },
): Promise<Record<string, string>>;
export function createPreparedEnrichmentContext(
  input: EnrichmentCheckpointInput & {
    observe?: EnrichmentCheckpointObserver;
    validateProject?: (value: unknown) => boolean;
  },
): Promise<PreparedCurrentState>;
