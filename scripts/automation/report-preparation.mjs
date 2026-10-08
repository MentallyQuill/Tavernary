import { format } from "prettier";
import { reconcileTavernKeeperReports } from "../security/import-tavernkeeper-reports.mjs";
import {
  TavernKeeperSynthesisError,
  synthesizeTavernKeeperReport,
} from "../security/tavernkeeper-synthesis.mjs";
import { validateAutomationOperation } from "./operation.mjs";
import {
  reportOperationDigest,
  isReportNarrativeRetry,
} from "./report-operations.mjs";
import { createTavernKeeperSynthesisProvider } from "../security/tavernkeeper-synthesis-provider.mjs";
import { modelProviderOptionsFromEnvironment } from "../catalog/model-provider-configuration.mjs";
export async function acquirePreparedReportData({
  state,
  operation,
  options = {},
}) {
  validateAutomationOperation(operation);
  if (
    operation.identity.kind !== "report-import" ||
    !state.operations.some((current) => current.key === operation.key)
  )
    throw Object.assign(new Error("Report acquisition is superseded."), {
      code: "input-superseded",
    });
  const digest = reportOperationDigest(operation);
  const narrative = isReportNarrativeRetry(operation);
  let provider;
  const outcome = await reconcileTavernKeeperReports({
    ...options,
    // Optional narrative providers must be supplied by the verified budget adapter.
    synthesizeReport:
      options.synthesizeReport ??
      (async (report) => {
        if (!narrative)
          throw new TavernKeeperSynthesisError(
            "provider-security",
            "budget-exhausted",
          );
        try {
          const budgetGuard = await options.budgetGuard?.();
          provider ??= createTavernKeeperSynthesisProvider({
            ...modelProviderOptionsFromEnvironment(options.env),
            requireBudget: true,
            budgetGuard,
            fetchImpl: options.providerFetchImpl,
          });
          return await synthesizeTavernKeeperReport(report, {
            provider,
            maxAttempts: 3,
            now: () => new Date(state.nowMs),
          });
        } catch (error) {
          if (error instanceof TavernKeeperSynthesisError) throw error;
          throw new TavernKeeperSynthesisError(
            "provider-security",
            error?.code === "budget-exhausted"
              ? "budget-exhausted"
              : "synthesis-boundary-failed",
          );
        }
      }),
    root: state.root,
    write: false,
    registry: state.local.sources,
    batchSize: 1,
    previousSnapshot: state.local.storedReports,
    priorImportState: state.local.importState,
    reportDigest: digest,
    retryReportDigest: narrative ? digest : undefined,
    now: () => new Date(state.nowMs),
  });
  return {
    "data/security/tavernkeeper-report-summaries.json": await format(
      JSON.stringify(outcome.snapshot),
      { parser: "json" },
    ),
    "data/security/tavernkeeper-import-state.json": await format(
      JSON.stringify(outcome.import_state),
      { parser: "json" },
    ),
  };
}
