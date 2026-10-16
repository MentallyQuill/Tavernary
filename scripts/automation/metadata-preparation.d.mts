import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { MetadataEvidence } from "./metadata-refresh.mjs";
import type {
  RegistryRecord,
  SourceRecord,
  RepositorySnapshot,
  EnrichmentProvider,
} from "../catalog/enrich-readmes.mjs";
import type { EnrichmentSource } from "../catalog/enrichment-source.mjs";
import type { ModelBudgetGuard } from "./model-budget.mjs";
import type { AcquisitionPhaseCallback } from "./acquisition-phase.mjs";
export interface MetadataPreparationInput {
  state: AutomationInventoryState;
  operation: AutomationOperation;
}
export interface MetadataObservation {
  source: EnrichmentSource;
  evidence: MetadataEvidence;
}
export function metadataOperationRecords(input: MetadataPreparationInput): {
  project: RegistryRecord;
  source: SourceRecord;
  snapshot: RepositorySnapshot;
};
export function observeMetadataSource(
  input: MetadataPreparationInput & {
    fetchImpl?: typeof fetch;
    onAcquisitionPhase?: AcquisitionPhaseCallback;
  },
): Promise<MetadataObservation>;
export function observeProjectMetadataSource(input: {
  state: AutomationInventoryState;
  project: RegistryRecord;
  source: SourceRecord;
  snapshot: RepositorySnapshot;
  fetchImpl?: typeof fetch;
  policyVersion?: string;
  onAcquisitionPhase?: AcquisitionPhaseCallback;
}): Promise<MetadataObservation>;
export function metadataObservationIsCached(
  input: MetadataPreparationInput & { observation: MetadataObservation },
): boolean;
export function validateMetadataPreparedFiles(
  input: MetadataPreparationInput & {
    observation: MetadataObservation;
    files: Array<{ path: string; content: string }>;
    validateProject: (value: unknown) => boolean;
  },
): boolean;
export function acquirePreparedMetadataData(
  input: MetadataPreparationInput & {
    options?: {
      env?: Record<string, string | undefined>;
      observe?: (
        input: MetadataPreparationInput,
      ) => Promise<MetadataObservation>;
      provider?: EnrichmentProvider;
      budgetGuard?: () => Promise<ModelBudgetGuard>;
      sleep?: (ms: number) => Promise<void>;
    };
  },
): Promise<Record<string, string>>;
