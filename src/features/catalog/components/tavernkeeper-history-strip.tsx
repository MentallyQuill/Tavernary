import type { TavernKeeperReportSummary } from "@/features/catalog/tavernkeeper-status";

function formatHistoryDate(scannedAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(scannedAt));
}

export function TavernKeeperHistoryStrip({
  history,
}: {
  history: readonly TavernKeeperReportSummary[];
}) {
  const conclusions = history.slice(-12);
  if (conclusions.length === 0) return null;

  return (
    <span
      aria-label="Recent TavernKeeper scan history"
      className="tavernkeeper-history-strip"
      role="group"
    >
      {conclusions.map((conclusion) => (
        <i
          aria-label={`TavernKeeper scan history: ${conclusion.result} result on ${formatHistoryDate(conclusion.scannedAt)} at commit ${conclusion.scannedSha.slice(0, 7)} under policy ${conclusion.scannerPolicyVersion}`}
          className={`tavernkeeper-history-${conclusion.result}`}
          key={conclusion.reportId}
          role="img"
        />
      ))}
    </span>
  );
}
