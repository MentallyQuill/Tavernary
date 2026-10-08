import { validateReportIndex } from "../security/tavernkeeper-reports.mjs";
import { validateTavernKeeperImportState } from "../security/tavernkeeper-import-state.mjs";
import { TAVERNKEEPER_SYNTHESIS_POLICY_VERSION } from "../security/tavernkeeper-assessment-contract.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import { operationKey } from "./operation.mjs";
import { classifyAutomationFailure } from "./failure.mjs";
import { planAutomationRetry } from "./retry.mjs";
import {
  recoverInventoryWorker,
  trustedOperationWorkerRuns,
} from "./inventory-worker.mjs";

export function discoverReportOperations(input) {
  const index = validateReportIndex(input.reportIndex, input.registry, {
    pruneDelisted: true,
  });
  validateTavernKeeperImportState(input.importState);
  return index.reports.flatMap((entry) => {
    if (
      input.importedReports.some(
        (report) =>
          report.report_digest === entry.report_digest &&
          report.repository_id === entry.repository_id &&
          report.target_sha === entry.target_sha &&
          report.synthesis_policy_version ===
            TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
      )
    )
      return [];
    const identity = {
      kind: "report-import",
      subject: `report:${entry.report_digest}`,
      inputDigest: fingerprintProjectPublicationInput({
        digest: entry.report_digest,
        sourceId: entry.source_id,
        repositoryId: entry.repository_id,
        targetSha: entry.target_sha,
      }),
      policyVersion: `${entry.scanner_policy_version}.${TAVERNKEEPER_SYNTHESIS_POLICY_VERSION}`,
    };
    const operation = {
      key: operationKey(identity),
      identity,
      stage: "admitted",
      createdAt: new Date(entry.completed_at).toISOString(),
      nextEligibleAt: null,
      expectedSha: entry.target_sha,
      workerRunId: null,
      retry: null,
    };
    const quarantine = input.importState.quarantines.find(
      (state) =>
        state.report_digest === entry.report_digest &&
        state.repository_id === entry.repository_id &&
        state.target_sha === entry.target_sha &&
        state.synthesis_policy_version ===
          TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    );
    if (quarantine) {
      const failure = classifyAutomationFailure({
        diagnosticCode: quarantine.diagnostic,
      });
      operation.retry = {
        failure,
        transientAttempts: Math.max(0, quarantine.attempts - 1),
        immediateAttempts: failure.kind === "unknown" ? quarantine.attempts : 0,
      };
      operation.nextEligibleAt = planAutomationRetry({
        ...operation.retry,
        nowMs: Date.parse(quarantine.last_failed_at),
        jitterSeed: operation.key,
      }).nextEligibleAt;
    }
    recoverInventoryWorker(
      operation,
      input,
      trustedOperationWorkerRuns(input, operation),
    );
    return [operation];
  });
}
