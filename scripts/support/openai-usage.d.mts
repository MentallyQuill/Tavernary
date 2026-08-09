export type UsagePeriod = { start: string; end: string };

export function completedUtcMonth(now?: Date): UsagePeriod;
export function aggregateOpenAiUsage(input: {
  usagePages: unknown[];
  costPages: unknown[];
  period: UsagePeriod;
  generatedAt: string;
}): {
  kind: "measured";
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  requests: number;
  costUsd: number;
  currency: "usd";
};
export function refreshOpenAiUsage(input: {
  fetch: typeof globalThis.fetch;
  env: Record<string, string | undefined>;
  now?: Date;
  outputPath: string;
}): Promise<unknown>;
