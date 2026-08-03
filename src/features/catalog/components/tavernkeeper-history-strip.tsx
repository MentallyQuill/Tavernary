import type { TavernKeeperReportSummary } from "@/features/catalog/tavernkeeper-status";

const riskLabels = {
  low: "low concern",
  material: "material concern",
  high: "high concern",
};

function formatHistoryDate(assessedAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(assessedAt));
}

export function TavernKeeperHistoryStrip({
  history,
}: {
  history: readonly TavernKeeperReportSummary[];
}) {
  const conclusions = history.slice(-12);
  if (conclusions.length < 2) return null;

  return (
    <span
      aria-label="Recent TavernKeeper scan history"
      className="tavernkeeper-history-strip"
      role="group"
    >
      {conclusions.map((conclusion) => {
        const label =
          `TavernKeeper scan history: ${riskLabels[conclusion.riskLevel]} ` +
          `on ${formatHistoryDate(conclusion.assessedAt)} at commit ` +
          `${conclusion.scannedSha.slice(0, 7)} under policy ` +
          conclusion.scannerPolicyVersion;
        return (
          <a
            aria-label={`Open TavernKeeper report for ${label}`}
            href={conclusion.reportUrl}
            key={conclusion.reportId}
            rel="noopener noreferrer"
            target="_blank"
          >
            <i
              aria-label={label}
              className={`tavernkeeper-history-${conclusion.riskLevel}`}
              role="img"
            />
          </a>
        );
      })}
    </span>
  );
}
