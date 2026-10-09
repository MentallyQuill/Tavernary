import { isDeepStrictEqual } from "node:util";
import { canonicalFileDigests } from "./canonical-files.mjs";
import { validateAutomationOperation } from "./operation.mjs";
import {
  discoverReportOperations,
  reportOperationDigest,
} from "./report-operations.mjs";
import {
  validateReportIndex,
  validateStoredReportIndex,
  validateScanReport,
  fetchAndValidateTavernKeeperReport,
} from "../security/tavernkeeper-reports.mjs";
import { validateTavernKeeperImportState } from "../security/tavernkeeper-import-state.mjs";
import {
  validateTavernaryAssessment,
  buildDeterministicAssessment,
  deriveReportAdvisory,
  TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
} from "../security/tavernkeeper-assessment-contract.mjs";

const verifiedReportCache = new Map();
const summaryPath = "data/security/tavernkeeper-report-summaries.json";
const importStatePath = "data/security/tavernkeeper-import-state.json";
function sameRecords(left, right) {
  return (
    left.length === right.length &&
    left.every((entry) =>
      right.some((other) => isDeepStrictEqual(entry, other)),
    )
  );
}
export async function createPreparedReportContext({
  state,
  operation,
  readReport = (entry) =>
    fetchAndValidateTavernKeeperReport(entry, { timeoutMs: 20_000 }),
  verifiedReports = verifiedReportCache,
}) {
  validateAutomationOperation(operation);
  if (operation.identity.kind !== "report-import")
    throw new Error("Report publication kind is invalid.");
  const digest = reportOperationDigest(operation);
  const selected = state.local.reportIndex?.reports.find(
    (entry) => entry.report_digest === digest,
  );
  if (!selected)
    throw Object.assign(new Error("Report publication is superseded."), {
      code: "input-superseded",
    });
  const source = state.local.sources.find(
    (source) => source.id === selected.source_id,
  );
  if (
    !source ||
    source.type !== "github" ||
    source.status !== "active" ||
    source.repository_id !== selected.repository_id
  )
    throw Object.assign(new Error("Report source authority changed."), {
      code: "authorization-lost",
    });
  const index = validateReportIndex(
    state.local.reportIndex,
    state.local.sources,
    { pruneDelisted: true },
  );
  const previous = validateStoredReportIndex(
    state.local.storedReports,
    state.local.sources,
  );
  const priorState = validateTavernKeeperImportState(state.local.importState);
  const discovered = discoverReportOperations({
    reportIndex: index,
    registry: state.local.sources,
    importState: priorState,
    importedReports: previous.reports,
    receipts: [],
    nowMs: state.nowMs,
    repository: state.repository,
    publisherActorId: state.publisherActorId,
    runs: state.remote.runs,
  });
  if (
    !discovered.some(
      (current) =>
        current.key === operation.key &&
        current.expectedSha === operation.expectedSha,
    )
  )
    throw Object.assign(new Error("Report publication is superseded."), {
      code: "input-superseded",
    });
  // Immutable scan bytes may be reused; current source, report, policy and base are checked for every context.
  const cacheKey = `${selected.repository_id}:${selected.report_digest}`;
  const report = validateScanReport(
    verifiedReports.get(cacheKey) ?? (await readReport(selected)),
    selected,
  );
  if (!verifiedReports.has(cacheKey) && verifiedReports.size >= 20)
    verifiedReports.delete(verifiedReports.keys().next().value);
  verifiedReports.set(cacheKey, report);
  const advisory = deriveReportAdvisory(report);
  const deterministic = buildDeterministicAssessment(report);
  const validTime = (value) =>
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= state.nowMs + 300_000;
  function validateContent(path, value) {
    try {
      if (path === summaryPath) {
        const snapshot = validateStoredReportIndex(value, state.local.sources);
        if (
          !validTime(snapshot.generated_at) ||
          Date.parse(snapshot.generated_at) < Date.parse(previous.generated_at)
        )
          return false;
        const tracked = snapshot.reports.find(
          (entry) => entry.report_id === selected.report_id,
        );
        if (
          !tracked ||
          tracked.synthesis_policy_version !==
            TAVERNKEEPER_SYNTHESIS_POLICY_VERSION ||
          !validTime(tracked.assessed_at) ||
          Date.parse(tracked.assessed_at) < Date.parse(selected.completed_at) ||
          !Object.entries(selected).every(([key, item]) =>
            isDeepStrictEqual(tracked[key], item),
          ) ||
          tracked.danger_basis !== advisory.danger_basis
        )
          return false;
        validateTavernaryAssessment(tracked.assessment, report);
        if (
          tracked.assessment_source !== "model" &&
          !isDeepStrictEqual(tracked.assessment, deterministic)
        )
          return false;
        if (
          !sameRecords(
            snapshot.reports.filter(
              (entry) => entry.report_id !== selected.report_id,
            ),
            previous.reports.filter(
              (entry) => entry.report_id !== selected.report_id,
            ),
          )
        )
          return false;
        const unrelatedPreferred = (data) =>
          data.preferred_report_ids.filter(
            (id) =>
              data.reports.find((entry) => entry.report_id === id)
                ?.source_id !== source.id,
          );
        return (
          snapshot.preferred_report_ids.includes(selected.report_id) &&
          sameRecords(
            unrelatedPreferred(snapshot),
            unrelatedPreferred(previous),
          )
        );
      }
      if (path === importStatePath) {
        const next = validateTavernKeeperImportState(value);
        if (
          !validTime(next.updated_at) ||
          Date.parse(next.updated_at) < Date.parse(priorState.updated_at) ||
          !sameRecords(
            next.quarantines.filter((entry) => entry.report_digest !== digest),
            priorState.quarantines.filter(
              (entry) => entry.report_digest !== digest,
            ),
          )
        )
          return false;
        return next.quarantines
          .filter((entry) => entry.report_digest === digest)
          .every(
            (entry) =>
              entry.report_id === selected.report_id &&
              entry.repository_id === source.repository_id &&
              entry.repository === selected.repository &&
              entry.target_sha === selected.target_sha &&
              entry.synthesis_policy_version ===
                TAVERNKEEPER_SYNTHESIS_POLICY_VERSION &&
              validTime(entry.last_failed_at) &&
              validTime(entry.first_failed_at),
          );
      }
    } catch {
      return false;
    }
    return false;
  }
  return {
    repository: state.repository,
    mainSha: state.local.revision,
    source: { id: source.id, identity: `github:${source.repository_id}` },
    authorId: state.publisherActorId,
    inputDigest: operation.identity.inputDigest,
    policyVersion: operation.identity.policyVersion,
    authorityValid: true,
    allowedPaths: [summaryPath, importStatePath],
    fileDigests: canonicalFileDigests({
      root: state.root,
      revision: state.local.revision,
      paths: [summaryPath, importStatePath],
    }),
    validateContent,
  };
}
