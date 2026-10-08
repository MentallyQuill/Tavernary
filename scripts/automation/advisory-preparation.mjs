import { format } from "prettier";
import {
  metadataOperationRecords,
  observeMetadataSource,
} from "./metadata-preparation.mjs";
import { createCatalogPolicyReviewProvider } from "../moderation/catalog-policy-review-provider.mjs";
import { reviewCatalogPolicy } from "../moderation/review-catalog-policy.mjs";
import { modelProviderOptionsFromEnvironment } from "../catalog/model-provider-configuration.mjs";
import { generateWithTransientProviderRetries } from "../catalog/enrichment-attempts.mjs";

export async function acquirePreparedAdvisoryData({
  state,
  operation,
  options = {},
}) {
  if (operation.identity.kind !== "advisory")
    throw Object.assign(new Error("Advisory preparation is superseded."), {
      code: "input-superseded",
    });
  const { project, source, snapshot } = metadataOperationRecords({
    state,
    operation,
  });
  const observation = await (options.observe ?? observeMetadataSource)({
    state,
    operation,
  });
  if (observation.source.status !== "ready")
    throw Object.assign(new Error("Advisory source is unavailable."), {
      code: "provider-unavailable",
    });
  let provider = options.provider;
  if (!provider) {
    const budgetGuard = await options.budgetGuard?.();
    try {
      provider = createCatalogPolicyReviewProvider({
        ...modelProviderOptionsFromEnvironment(options.env),
        requireBudget: true,
        budgetGuard,
      });
    } catch {
      throw Object.assign(
        new Error("Advisory provider configuration is unavailable."),
        { code: "provider-configuration-invalid" },
      );
    }
  }
  const previous = (state.local.advisoryState ?? []).find(
    (value) => value.project_id === project.id && value.source_id === source.id,
  );
  let providerFailure;
  const result = await reviewCatalogPolicy({
    project,
    source,
    snapshot,
    previous,
    now: state.nowMs,
    policyVersion: operation.identity.policyVersion,
    maintenanceIssueNumber: previous?.maintenance_issue_number ?? null,
    loadSource: async () => observation.source,
    provider: {
      review: async (input) => {
        try {
          return await generateWithTransientProviderRetries({
            input,
            generate: (candidate) => provider.review(candidate),
            sleep: options.sleep,
          });
        } catch (error) {
          providerFailure = error;
          throw error;
        }
      },
    },
  });
  if (result.status === "review-unavailable")
    throw (
      providerFailure ??
      Object.assign(new Error("Advisory output is unavailable."), {
        code: "provider-response-invalid",
      })
    );
  return {
    [`data/snapshots/policy-review/${project.id}.json`]: await format(
      JSON.stringify(result.state),
      { parser: "json" },
    ),
  };
}
