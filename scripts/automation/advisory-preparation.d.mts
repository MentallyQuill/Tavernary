import type {
  MetadataPreparationInput,
  MetadataObservation,
} from "./metadata-preparation.mjs";
import type { createCatalogPolicyReviewProvider } from "../moderation/catalog-policy-review-provider.mjs";
import type { ModelBudgetGuard } from "./model-budget.mjs";
export interface ModelPreparationOptions {
  env?: Record<string, string | undefined>;
  observe?: (input: MetadataPreparationInput) => Promise<MetadataObservation>;
  budgetGuard?: () => Promise<ModelBudgetGuard>;
  sleep?: (ms: number) => Promise<void>;
}
export function acquirePreparedAdvisoryData(
  input: MetadataPreparationInput & {
    options?: ModelPreparationOptions & {
      provider?: ReturnType<typeof createCatalogPolicyReviewProvider>;
    };
  },
): Promise<Record<string, string>>;
