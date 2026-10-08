import { format } from "prettier";
import { reconcileTavernKeeperReports } from "../security/import-tavernkeeper-reports.mjs";
import { TavernKeeperSynthesisError } from "../security/tavernkeeper-synthesis.mjs";
import { validateAutomationOperation } from "./operation.mjs";
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
  const outcome = await reconcileTavernKeeperReports({
    ...options,
    // Optional narrative providers must be supplied by the verified budget adapter.
    synthesizeReport:
      options.synthesizeReport ??
      (async () => {
        throw new TavernKeeperSynthesisError(
          "provider-security",
          "budget-exhausted",
        );
      }),
    root: state.root,
    write: false,
    registry: state.local.sources,
    batchSize: 1,
    previousSnapshot: state.local.storedReports,
    priorImportState: state.local.importState,
    reportDigest: operation.identity.subject.slice(7),
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
