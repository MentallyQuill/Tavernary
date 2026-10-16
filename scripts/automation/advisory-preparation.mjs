import { format } from "prettier";
import {
  metadataOperationRecords,
  observeMetadataSource,
} from "./metadata-preparation.mjs";
import { createCatalogPolicyReviewProvider } from "../moderation/catalog-policy-review-provider.mjs";
import { reviewCatalogPolicy } from "../moderation/review-catalog-policy.mjs";
import { modelProviderOptionsFromEnvironment } from "../catalog/model-provider-configuration.mjs";
import { generateWithTransientProviderRetries } from "../catalog/enrichment-attempts.mjs";
import { markAcquisitionPhase } from "./acquisition-phase.mjs";

export async function acquirePreparedAdvisoryData({
  state,
  operation,
  options = {},
}) {
  markAcquisitionPhase(options, "operation-records");
  if (operation.identity.kind !== "advisory")
    throw Object.assign(new Error("Advisory preparation is superseded."), {
      code: "input-superseded",
    });
  const { project, source, snapshot } = metadataOperationRecords({
    state,
    operation,
  });
  markAcquisitionPhase(options, "observe-source");
  const observation = await (options.observe ?? observeMetadataSource)({
    state,
    operation,
    onAcquisitionPhase: (phase) => markAcquisitionPhase(options, phase),
  });
  if (observation.source.status !== "ready")
    throw Object.assign(new Error("Advisory source is unavailable."), {
      code: "provider-unavailable",
    });
  markAcquisitionPhase(options, "provider-config");
  let provider = options.provider;
  if (!provider) {
    markAcquisitionPhase(options, "budget-guard");
    const budgetGuard = await options.budgetGuard?.();
    markAcquisitionPhase(options, "provider-config");
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
  markAcquisitionPhase(options, "provider-input");
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
          markAcquisitionPhase(options, "provider-review");
          const output = await generateWithTransientProviderRetries({
            input,
            generate: (candidate) => provider.review(candidate),
            sleep: options.sleep,
          });
          markAcquisitionPhase(options, "provider-output");
          return output;
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
  markAcquisitionPhase(options, "acquisition-output");
  return {
    [`data/snapshots/policy-review/${project.id}.json`]: await format(
      JSON.stringify(result.state),
      { parser: "json" },
    ),
  };
}
