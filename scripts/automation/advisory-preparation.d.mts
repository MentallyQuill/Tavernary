import type {
  MetadataPreparationInput,
  MetadataObservation,
} from "./metadata-preparation.mjs";
import type { createCatalogPolicyReviewProvider } from "../moderation/catalog-policy-review-provider.mjs";
import type { ModelBudgetGuard } from "./model-budget.mjs";
import type { AcquisitionPhaseCallback } from "./acquisition-phase.mjs";
export interface ModelPreparationOptions {
  env?: Record<string, string | undefined>;
  observe?: (
    input: MetadataPreparationInput & {
      onAcquisitionPhase?: AcquisitionPhaseCallback;
    },
  ) => Promise<MetadataObservation>;
  budgetGuard?: () => Promise<ModelBudgetGuard>;
  sleep?: (ms: number) => Promise<void>;
  onAcquisitionPhase?: AcquisitionPhaseCallback;
}
export function acquirePreparedAdvisoryData(
  input: MetadataPreparationInput & {
    options?: ModelPreparationOptions & {
      provider?: ReturnType<typeof createCatalogPolicyReviewProvider>;
    };
  },
): Promise<Record<string, string>>;
