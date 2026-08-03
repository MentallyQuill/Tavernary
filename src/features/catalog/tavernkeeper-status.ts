import { ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION } from "../../../scripts/security/tavernkeeper-reports.mjs";

export type TavernKeeperVisualState =
  "teal" | "orange" | "red" | "gray" | "unsupported";

export type TavernKeeperStatusReason =
  | "unsupported"
  | "current"
  | "outdated-concerning"
  | "outdated-clean"
  | "unscanned"
  | "source-unavailable";

export interface TavernKeeperReportSummary {
  reportId: string;
  result: "teal" | "red";
  scannedSha: string;
  scannedAt: string;
  summary: {
    headline: string;
    detail: string;
  };
  scannerPolicyVersion: string;
  reportUrl: string;
  historyUrl: string;
  reportableSeverity: {
    critical: number;
    high: number;
    medium: number;
  };
}

export interface TavernKeeperCardStatus {
  state: TavernKeeperVisualState;
  reason: TavernKeeperStatusReason;
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

export interface TavernKeeperPreferredReport {
  report_id: string;
  report_version: number;
  supersedes_report_id: string | null;
  source_id: string;
  provider: string;
  repository_id: number;
  repository: string;
  target_sha: string;
  scanner_policy_version: string;
  completed_at: string;
  result: "teal" | "red";
  summary: TavernKeeperReportSummary["summary"];
  finding_counts: {
    reportable_severity: TavernKeeperReportSummary["reportableSeverity"];
    severity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    };
  };
  report_url: string;
  history_url: string;
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
    snapshot.stale_since != null ||
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
  source: ActiveGithubSource,
) {
  return (
    report.repository_id === source.repository_id &&
    report.source_id === source.id &&
    report.repository === source.repository &&
    report.provider === "github" &&
    report.scanner_policy_version === ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION
  );
}

function summarize(
  report: TavernKeeperPreferredReport,
): TavernKeeperReportSummary {
  return {
    reportId: report.report_id,
    result: report.result,
    scannedSha: report.target_sha,
    scannedAt: report.completed_at,
    summary: report.summary,
    scannerPolicyVersion: report.scanner_policy_version,
    reportUrl: report.report_url,
    historyUrl: report.history_url,
    reportableSeverity: report.finding_counts.reportable_severity,
  };
}

const rfc3339OrderingPattern =
  /^(?<prefix>\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:)(?<second>\d{2})(?:\.(?<fraction>\d+))?(?<zone>[Zz]|[+-]\d{2}:\d{2})$/u;

function rfc3339OrderKey(timestamp: string) {
  const match = rfc3339OrderingPattern.exec(timestamp);
  if (!match?.groups) {
    throw new Error(`Invalid RFC3339 timestamp: ${timestamp}`);
  }

  const leapSecond = match.groups.second === "60";
  const normalizedWholeSecond = `${match.groups.prefix}${
    leapSecond ? "59" : match.groups.second
  }${match.groups.zone}`
    .replace("t", "T")
    .replace(/z$/u, "Z");
  const parsedEpoch = Date.parse(normalizedWholeSecond);
  if (!Number.isFinite(parsedEpoch)) {
    throw new Error(`Invalid RFC3339 timestamp: ${timestamp}`);
  }

  return {
    epochSecond: parsedEpoch / 1_000 + (leapSecond ? 1 : 0),
    fraction: match.groups.fraction ?? "",
    phase: leapSecond ? 0 : 1,
  };
}

function compareFractions(left: string, right: string) {
  const width = Math.max(left.length, right.length);
  const normalizedLeft = left.padEnd(width, "0");
  const normalizedRight = right.padEnd(width, "0");
  if (normalizedLeft === normalizedRight) {
    return 0;
  }
  return normalizedLeft < normalizedRight ? -1 : 1;
}

function compareRfc3339(left: string, right: string) {
  const leftKey = rfc3339OrderKey(left);
  const rightKey = rfc3339OrderKey(right);
  return (
    leftKey.epochSecond - rightKey.epochSecond ||
    leftKey.phase - rightKey.phase ||
    compareFractions(leftKey.fraction, rightKey.fraction)
  );
}

function compareReports(
  left: TavernKeeperPreferredReport,
  right: TavernKeeperPreferredReport,
) {
  return (
    compareRfc3339(left.completed_at, right.completed_at) ||
    left.report_id.localeCompare(right.report_id)
  );
}

function newestReport(reports: TavernKeeperPreferredReport[]) {
  return [...reports].sort(compareReports).at(-1);
}

function compactHistory(reports: TavernKeeperPreferredReport[]) {
  return [...reports].sort(compareReports).slice(-12).map(summarize);
}

function preferredConclusions(reports: TavernKeeperPreferredReport[]) {
  const preferred = new Map<string, TavernKeeperPreferredReport>();
  for (const report of reports) {
    const identity = [report.target_sha, report.scanner_policy_version].join(
      "\u0000",
    );
    const current = preferred.get(identity);
    if (
      !current ||
      report.report_version > current.report_version ||
      (report.report_version === current.report_version &&
        compareReports(report, current) > 0)
    ) {
      preferred.set(identity, report);
    }
  }
  return [...preferred.values()];
}

function unsupportedStatus(): TavernKeeperCardStatus {
  return {
    state: "unsupported",
    reason: "unsupported",
    currentSha: null,
    report: null,
    history: [],
    historyUrl: null,
  };
}

export function deriveTavernKeeperCardStatus({
  projectKind,
  source,
  snapshot,
  preferredReports,
}: {
  projectKind?: string;
  source: TavernKeeperSource | null | undefined;
  snapshot: TavernKeeperSnapshot | null | undefined;
  preferredReports: readonly TavernKeeperPreferredReport[];
}): TavernKeeperCardStatus {
  if (projectKind === "preset" || !isActiveGithubSource(source)) {
    return unsupportedStatus();
  }

  const reports = preferredConclusions(
    preferredReports.filter((report) =>
      isPreferredReportForSource(report, source),
    ),
  );
  const newest = newestReport(reports);
  const history = compactHistory(reports);
  const historyUrl = newest?.history_url ?? null;
  const currentSha = currentShaFor(source, snapshot);

  if (!currentSha) {
    return {
      state: newest?.result === "red" ? "red" : "gray",
      reason: "source-unavailable",
      currentSha: null,
      report: newest ? summarize(newest) : null,
      history,
      historyUrl,
    };
  }

  const currentReport = newestReport(
    reports.filter((report) => report.target_sha === currentSha),
  );
  if (currentReport) {
    return {
      state: currentReport.result,
      reason: "current",
      currentSha,
      report: summarize(currentReport),
      history,
      historyUrl,
    };
  }

  if (newest) {
    return {
      state: newest.result === "red" ? "red" : "orange",
      reason:
        newest.result === "red" ? "outdated-concerning" : "outdated-clean",
      currentSha,
      report: summarize(newest),
      history,
      historyUrl,
    };
  }

  return {
    state: "gray",
    reason: "unscanned",
    currentSha,
    report: null,
    history: [],
    historyUrl: null,
  };
}
