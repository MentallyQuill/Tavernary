import type { TavernKeeperScanReportV5 } from "./tavernkeeper-reports.mjs";

export function tavernKeeperSynthesisInstructions(): string;
export function createTavernKeeperSynthesisProvider(options: {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}): {
  configuration: { apiUrl: string; apiKey: string; model: string };
  generate(input: {
    report: TavernKeeperScanReportV5;
    repair?: string;
  }): Promise<{
    output: unknown;
    metadata: {
      requestedModel: string;
      returnedModel: string | null;
      latencyMs: number;
    };
  }>;
};
