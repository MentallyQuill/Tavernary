export const ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION = "5";

export type TavernKeeperAssessmentSource =
  "model" | "deterministic_fallback" | "deterministic_regrade";

export type TavernKeeperRiskLevel = "low" | "material" | "high";
export type TavernKeeperDangerBasis =
  | "none"
  | "malicious_or_compromised"
  | "critical_exploitable_vulnerability"
  | "mixed";
export type TavernKeeperVisualState =
  "teal" | "orange" | "red" | "gray" | "unsupported";
export type TavernKeeperFreshness =
  "current" | "stale" | "unavailable" | "unassessed" | "unsupported";
export type TavernKeeperJavaScriptAnalysisStatus =
  "complete" | "incomplete" | "legacy";

export interface TavernKeeperFinalAssessment {
  risk_level: TavernKeeperRiskLevel;
  headline: string;
  summary: string;
  minor_cautions: number;
  material_concerns: number;
  high_danger: number;
  malicious_evidence: string;
  cited_finding_ids: string[];
  interaction_chains: Array<{
    finding_ids: string[];
    resulting_risk: "material" | "high";
    explanation: string;
  }>;
}

export interface TavernKeeperAssessedReport {
  report_id: string;
  source_id: string;
  provider: string;
  repository_id: number;
  repository: string;
  target_sha: string;
  scanner_policy_version: string;
  contextual_review_policy_version: string;
  completed_at: string;
  assessed_at: string;
  synthesis_policy_version: string;
  synthesis_model: string;
  danger_basis: TavernKeeperDangerBasis;
  assessment_source: TavernKeeperAssessmentSource;
  coverage: {
    javascript_analysis_status: TavernKeeperJavaScriptAnalysisStatus;
  };
  report_url: string;
  history_url?: string;
  assessment: TavernKeeperFinalAssessment;
}

export interface TavernKeeperReportSummary {
  reportId: string;
  riskLevel: TavernKeeperRiskLevel;
  headline: string;
  summary: string;
  minorCautions: number;
  materialConcerns: number;
  highDanger: number;
  maliciousEvidence: string;
  citedFindingIds: string[];
  scannedSha: string;
  treeUrl: string;
  scannedAt: string;
  assessedAt: string;
  scannerPolicyVersion: string;
  contextualReviewPolicyVersion: string;
  synthesisPolicyVersion: string;
  synthesisModel: string;
  dangerBasis: TavernKeeperDangerBasis;
  assessmentSource: TavernKeeperAssessmentSource;
  javascriptAnalysisStatus: TavernKeeperJavaScriptAnalysisStatus | null;
  reportUrl: string;
  technicalHistoryUrl: string | null;
}

export interface TavernKeeperCardStatus {
  state: TavernKeeperVisualState;
  riskLevel: TavernKeeperRiskLevel | null;
  freshness: TavernKeeperFreshness;
  currentSha: string | null;
  report: TavernKeeperReportSummary | null;
  history: TavernKeeperReportSummary[];
  historyUrl: string | null;
}

interface TavernKeeperSource {
  id?: string;
  type?: string;
  status?: string;
  repository?: string;
  repository_id?: number;
}

interface TavernKeeperSnapshot {
  provider?: string;
  source_health?: string;
  stale_since?: string | null;
  repository?: { id?: number; head_sha?: string | null };
}

interface ActiveGithubSource extends TavernKeeperSource {
  id: string;
  type: "github";
  status: "active";
  repository: string;
  repository_id: number;
}

const fullShaPattern = /^[0-9a-f]{40}$/u;
const riskColors: Record<TavernKeeperRiskLevel, TavernKeeperVisualState> = {
  low: "teal",
  material: "orange",
  high: "red",
};

function isActiveGithubSource(
  source: TavernKeeperSource | null | undefined,
): source is ActiveGithubSource {
  return (
    source?.type === "github" &&
    source.status === "active" &&
    typeof source.id === "string" &&
    typeof source.repository === "string" &&
    Number.isSafeInteger(source.repository_id) &&
    (source.repository_id ?? 0) > 0
  );
}

function currentShaFor(
  source: TavernKeeperSource,
  snapshot: TavernKeeperSnapshot | null | undefined,
) {
  const currentSha = snapshot?.repository?.head_sha;
  if (
    snapshot?.provider !== "github" ||
    snapshot.source_health !== "healthy" ||
    snapshot.stale_since != null ||
    snapshot.repository?.id !== source.repository_id ||
    typeof currentSha !== "string" ||
    !fullShaPattern.test(currentSha)
  ) {
    return null;
  }
  return currentSha;
}

function reportMatchesSource(
  report: TavernKeeperAssessedReport,
  source: ActiveGithubSource,
) {
  return (
    report.repository_id === source.repository_id &&
    report.source_id === source.id &&
    report.repository === source.repository &&
    report.provider === "github" &&
    ["3", "4", ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION].includes(
      report.scanner_policy_version,
    )
  );
}

function compareReports(
  left: TavernKeeperAssessedReport,
  right: TavernKeeperAssessedReport,
) {
  return (
    Date.parse(left.assessed_at) - Date.parse(right.assessed_at) ||
    left.report_id.localeCompare(right.report_id)
  );
}

function newest(reports: TavernKeeperAssessedReport[]) {
  return [...reports].sort(compareReports).at(-1);
}

function summarize(
  report: TavernKeeperAssessedReport,
): TavernKeeperReportSummary {
  return {
    reportId: report.report_id,
    riskLevel: report.assessment.risk_level,
    headline: report.assessment.headline,
    summary: report.assessment.summary,
    minorCautions: report.assessment.minor_cautions,
    materialConcerns: report.assessment.material_concerns,
    highDanger: report.assessment.high_danger,
    maliciousEvidence: report.assessment.malicious_evidence,
    citedFindingIds: report.assessment.cited_finding_ids,
    scannedSha: report.target_sha,
    treeUrl: `https://github.com/${report.repository}/tree/${report.target_sha}`,
    scannedAt: report.completed_at,
    assessedAt: report.assessed_at,
    scannerPolicyVersion: report.scanner_policy_version,
    contextualReviewPolicyVersion: report.contextual_review_policy_version,
    synthesisPolicyVersion: report.synthesis_policy_version,
    synthesisModel: report.synthesis_model,
    dangerBasis: report.danger_basis,
    assessmentSource: report.assessment_source,
    javascriptAnalysisStatus: report.coverage.javascript_analysis_status,
    reportUrl: report.report_url,
    technicalHistoryUrl: report.history_url ?? null,
  };
}

function unsupportedStatus(): TavernKeeperCardStatus {
  return {
    state: "unsupported",
    riskLevel: null,
    freshness: "unsupported",
    currentSha: null,
    report: null,
    history: [],
    historyUrl: null,
  };
}

export function deriveTavernKeeperCardStatus({
  source,
  snapshot,
  assessedReports,
  preferredReportIds,
}: {
  source: TavernKeeperSource | null | undefined;
  snapshot: TavernKeeperSnapshot | null | undefined;
  assessedReports: readonly TavernKeeperAssessedReport[];
  preferredReportIds: readonly string[];
}): TavernKeeperCardStatus {
  if (!isActiveGithubSource(source)) {
    return unsupportedStatus();
  }

  const reports = assessedReports
    .filter((report) => reportMatchesSource(report, source))
    .sort(compareReports);
  const activeReports = reports.filter(
    (report) =>
      report.scanner_policy_version ===
      ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION,
  );
  const preferredIds = new Set(preferredReportIds);
  const preferred = newest(
    activeReports.filter((report) => preferredIds.has(report.report_id)),
  );
  const selected =
    preferred ??
    newest(activeReports) ??
    newest(reports.filter((report) => preferredIds.has(report.report_id))) ??
    newest(reports);
  const currentSha = currentShaFor(source, snapshot);
  const history = reports.slice(-12).map(summarize);
  const historyUrl =
    reports.length > 0
      ? `/security/tavernkeeper/history/${encodeURIComponent(source.id)}/`
      : null;

  if (!selected) {
    return {
      state: "gray",
      riskLevel: null,
      freshness: currentSha ? "unassessed" : "unavailable",
      currentSha,
      report: null,
      history,
      historyUrl,
    };
  }

  const riskLevel = selected.assessment.risk_level;
  const freshness: TavernKeeperFreshness = currentSha
    ? preferred && selected.target_sha === currentSha
      ? "current"
      : "stale"
    : "unavailable";
  return {
    state: riskColors[riskLevel],
    riskLevel,
    freshness,
    currentSha,
    report: summarize(selected),
    history,
    historyUrl,
  };
}
