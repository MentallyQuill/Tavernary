import Link from "next/link";

import type { TavernKeeperAssessedReport } from "@/features/catalog/tavernkeeper-status";
import snapshotData from "../../../../../../data/security/tavernkeeper-report-summaries.json";

const snapshot = snapshotData as unknown as {
  reports: TavernKeeperAssessedReport[];
};
const riskLabels = {
  low: "Low concern",
  material: "Material concern",
  high: "High concern",
};

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function sourceReports(
  sourceId: string,
  reports: readonly TavernKeeperAssessedReport[],
) {
  return reports
    .filter((report) => report.source_id === sourceId)
    .sort(
      (left, right) =>
        Date.parse(right.assessed_at) - Date.parse(left.assessed_at) ||
        right.report_id.localeCompare(left.report_id),
    );
}

export function TavernKeeperAssessmentHistory({
  sourceId,
  reports,
}: {
  sourceId: string;
  reports: readonly TavernKeeperAssessedReport[];
}) {
  const history = sourceReports(sourceId, reports);
  const repository = history[0]?.repository;

  return (
    <main className="help-page tavernkeeper-history-page">
      <nav className="help-nav" aria-label="TavernKeeper history navigation">
        <Link href="/">← Back to the catalog</Link>
      </nav>
      <article className="help-content">
        <p className="help-kicker">TavernKeeper</p>
        <h1>
          TavernKeeper scan history
          {repository ? ` for ${repository}` : ""}
        </h1>
        <div className="help-lead">
          <p>
            This is Tavernary&apos;s automated final-assessment history. Each
            grade is bound to one exact commit and its separate TavernKeeper
            technical report.
          </p>
        </div>
        {history.length === 0 ? (
          <p>No completed TavernKeeper assessments are available.</p>
        ) : (
          <ol className="tavernkeeper-history-list">
            {history.map((report) => (
              <li key={report.report_id}>
                <article
                  className={`tavernkeeper-history-entry tavernkeeper-history-entry-${report.assessment.risk_level}`}
                >
                  <header>
                    <h2>{riskLabels[report.assessment.risk_level]}</h2>
                    <time dateTime={report.assessed_at}>
                      Assessed {formatDate(report.assessed_at)}
                    </time>
                  </header>
                  {report.assessment.headline !==
                  riskLabels[report.assessment.risk_level] ? (
                    <p className="tavernkeeper-history-headline">
                      {report.assessment.headline}
                    </p>
                  ) : null}
                  <p>{report.assessment.summary}</p>
                  <p>{report.assessment.malicious_evidence}</p>
                  <dl>
                    <div>
                      <dt>Commit</dt>
                      <dd>
                        <a
                          href={`https://github.com/${report.repository}/tree/${report.target_sha}`}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          commit {report.target_sha.slice(0, 7)}
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>Assessment model</dt>
                      <dd>{report.synthesis_model}</dd>
                    </div>
                    <div>
                      <dt>Policies</dt>
                      <dd>
                        Scanner policy {report.scanner_policy_version} · Context
                        review policy {report.contextual_review_policy_version}{" "}
                        · Synthesis policy {report.synthesis_policy_version}
                      </dd>
                    </div>
                  </dl>
                  <a
                    href={report.report_url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    View TavernKeeper technical report
                  </a>
                </article>
              </li>
            ))}
          </ol>
        )}
      </article>
    </main>
  );
}

export function historyStaticParams(
  reports: readonly TavernKeeperAssessedReport[],
) {
  const sourceIds = [...new Set(reports.map((report) => report.source_id))];
  return (sourceIds.length === 0 ? ["unavailable"] : sourceIds).map(
    (sourceId) => ({ sourceId }),
  );
}

export function generateStaticParams() {
  return historyStaticParams(snapshot.reports);
}

export const dynamicParams = false;

export default async function TavernKeeperHistoryPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId } = await params;
  return (
    <TavernKeeperAssessmentHistory
      sourceId={sourceId}
      reports={snapshot.reports}
    />
  );
}
