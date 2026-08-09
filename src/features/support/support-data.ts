import snapshot from "../../../data/support/monthly-usage.json";

type SupportUsageRecord = {
  kind: "estimate" | "measured";
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  inputTokens: number;
  cachedInputTokens: number | null;
  outputTokens: number;
  requests: number;
  costUsd: number;
  currency: "usd";
};

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSupportUsageRecord(value: unknown): value is SupportUsageRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.kind === "estimate" || record.kind === "measured") &&
    typeof record.periodStart === "string" &&
    typeof record.periodEnd === "string" &&
    typeof record.generatedAt === "string" &&
    isNonNegativeNumber(record.inputTokens) &&
    (record.cachedInputTokens === null ||
      isNonNegativeNumber(record.cachedInputTokens)) &&
    isNonNegativeNumber(record.outputTokens) &&
    isNonNegativeNumber(record.requests) &&
    isNonNegativeNumber(record.costUsd) &&
    record.currency === "usd"
  );
}

export function getLatestSupportUsage(): SupportUsageRecord {
  if (
    snapshot.schemaVersion !== 1 ||
    !Array.isArray(snapshot.records) ||
    !isSupportUsageRecord(snapshot.records[0])
  ) {
    throw new Error("Invalid Tavernary support usage snapshot.");
  }
  return snapshot.records[0];
}
