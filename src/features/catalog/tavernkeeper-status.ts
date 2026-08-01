import { ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION } from "../../../scripts/security/tavernkeeper-reports.mjs";

export interface TavernKeeperReportSummary {
  reportId: string;
  result: "green" | "yellow";
  scannedSha: string;
  scannedAt: string;
  reportUrl: string;
  severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export type TavernKeeperCardStatus =
  | {
      state: "green" | "yellow";
      reason: "current";
      currentSha: string;
      report: TavernKeeperReportSummary;
    }
  | {
      state: "gray";
      reason: "pending" | "outdated" | "source-unavailable";
      currentSha: string | null;
      report: TavernKeeperReportSummary | null;
    };

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
  repository?: { id?: number; head_sha?: string | null };
}

export interface TavernKeeperPreferredReport {
  report_id: string;
  source_id: string;
  provider: string;
  repository_id: number;
  repository: string;
  target_sha: string;
  scanner_policy_version: string;
  completed_at: string;
  result: "green" | "yellow";
  finding_counts: {
    severity: TavernKeeperReportSummary["severity"];
  };
  report_url: string;
}

const fullShaPattern = /^[0-9a-f]{40}$/u;

interface ActiveGithubSource extends TavernKeeperSource {
  id: string;
  type: "github";
  status: "active";
  repository: string;
  repository_id: number;
}

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
    snapshot.repository?.id !== source.repository_id ||
    typeof currentSha !== "string" ||
    !fullShaPattern.test(currentSha)
  ) {
    return null;
  }
  return currentSha;
}

function isPreferredReportForSource(
  report: TavernKeeperPreferredReport,
  source: TavernKeeperSource,
) {
  return (
    report.provider === "github" &&
    report.source_id === source.id &&
    report.repository_id === source.repository_id &&
    report.repository === source.repository &&
    report.scanner_policy_version ===
      ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION
  );
}

function summarize(report: TavernKeeperPreferredReport): TavernKeeperReportSummary {
  return {
    reportId: report.report_id,
    result: report.result,
    scannedSha: report.target_sha,
    scannedAt: report.completed_at,
    reportUrl: report.report_url,
    severity: report.finding_counts.severity,
  };
}

function newestReport(reports: TavernKeeperPreferredReport[]) {
  return [...reports].sort(
    (left, right) =>
      right.completed_at.localeCompare(left.completed_at) ||
      right.report_id.localeCompare(left.report_id),
  )[0];
}

export function deriveTavernKeeperCardStatus({
  source,
  snapshot,
  preferredReports,
}: {
  source: TavernKeeperSource | null | undefined;
  snapshot: TavernKeeperSnapshot | null | undefined;
  preferredReports: readonly TavernKeeperPreferredReport[];
}): TavernKeeperCardStatus | null {
  if (!isActiveGithubSource(source)) {
    return null;
  }

  const currentSha = currentShaFor(source, snapshot);
  if (!currentSha) {
    return {
      state: "gray",
      reason: "source-unavailable",
      currentSha: null,
      report: null,
    };
  }

  const reports = preferredReports.filter((report) =>
    isPreferredReportForSource(report, source),
  );
  const currentReport = reports.find((report) => report.target_sha === currentSha);
  if (currentReport) {
    return {
      state: currentReport.result,
      reason: "current",
      currentSha,
      report: summarize(currentReport),
    };
  }

  const olderReport = newestReport(reports);
  if (olderReport) {
    return {
      state: "gray",
      reason: "outdated",
      currentSha,
      report: summarize(olderReport),
    };
  }

  return {
    state: "gray",
    reason: "pending",
    currentSha,
    report: null,
  };
}
