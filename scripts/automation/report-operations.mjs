import { validateReportIndex } from "../security/tavernkeeper-reports.mjs";
import { validateTavernKeeperImportState } from "../security/tavernkeeper-import-state.mjs";
import { TAVERNKEEPER_SYNTHESIS_POLICY_VERSION } from "../security/tavernkeeper-assessment-contract.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import { operationKey } from "./operation.mjs";
import {
  recoverInventoryWorker,
  trustedOperationWorkerRuns,
} from "./inventory-worker.mjs";

export function reportOperationDigest(operation) {
  const match = /^report:(?:narrative:)?([a-f0-9]{64})$/u.exec(
    operation.identity.subject,
  );
  if (operation.identity.kind !== "report-import" || !match)
    throw new Error("Report operation identity is invalid.");
  return match[1];
}
export function isReportNarrativeRetry(operation) {
  reportOperationDigest(operation);
  return operation.identity.subject.startsWith("report:narrative:");
}
function narrativeRequest(input, entry, quarantine) {
  if (!quarantine || input.repository !== "MentallyQuill/Tavernary")
    return null;
  return (
    (input.runs ?? [])
      .filter(
        (run) =>
          Number.isSafeInteger(run.id) &&
          run.id > 0 &&
          run.run_attempt === 1 &&
          run.path === ".github/workflows/import-tavernkeeper-reports.yml" &&
          run.event === "workflow_dispatch" &&
          run.head_branch === "main" &&
          /^[a-f0-9]{40}$/u.test(run.head_sha ?? "") &&
          run.head_repository?.full_name === input.repository &&
          run.actor?.id === 2625904 &&
          run.actor.type === "User" &&
          run.display_title ===
            `Security: Retry narrative ${entry.report_digest}` &&
          Date.parse(run.created_at ?? "") >
            Date.parse(quarantine.last_failed_at) &&
          Date.parse(run.created_at ?? "") <= input.nowMs + 300_000,
      )
      .sort(
        (left, right) =>
          Date.parse(right.created_at) - Date.parse(left.created_at) ||
          right.id - left.id,
      )[0] ?? null
  );
}

export function discoverReportOperations(input) {
  const index = validateReportIndex(input.reportIndex, input.registry, {
    pruneDelisted: true,
  });
  validateTavernKeeperImportState(input.importState);
  return index.reports.flatMap((entry) => {
    const imported = input.importedReports.some(
      (report) =>
        report.report_digest === entry.report_digest &&
        report.repository_id === entry.repository_id &&
        report.target_sha === entry.target_sha &&
        report.synthesis_policy_version ===
          TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    );
    const quarantine = input.importState.quarantines.find(
      (state) =>
        state.report_digest === entry.report_digest &&
        state.repository_id === entry.repository_id &&
        state.target_sha === entry.target_sha &&
        state.synthesis_policy_version ===
          TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    );
    const request = imported
      ? narrativeRequest(input, entry, quarantine)
      : null;
    if (imported && !request) return [];
    const identity = {
      kind: "report-import",
      subject: `report:${request ? "narrative:" : ""}${entry.report_digest}`,
      inputDigest: fingerprintProjectPublicationInput({
        digest: entry.report_digest,
        sourceId: entry.source_id,
        repositoryId: entry.repository_id,
        targetSha: entry.target_sha,
        ...(request ? { narrativeRequestRunId: request.id } : {}),
      }),
      policyVersion: `${entry.scanner_policy_version}.${TAVERNKEEPER_SYNTHESIS_POLICY_VERSION}${request ? `.narrative-${request.id}` : ""}`,
    };
    const operation = {
      key: operationKey(identity),
      identity,
      stage: "admitted",
      createdAt: new Date(
        request?.created_at ?? entry.completed_at,
      ).toISOString(),
      nextEligibleAt: null,
      expectedSha: entry.target_sha,
      workerRunId: null,
      retry: null,
    };
    recoverInventoryWorker(
      operation,
      input,
      trustedOperationWorkerRuns(input, operation),
    );
    return [operation];
  });
}
