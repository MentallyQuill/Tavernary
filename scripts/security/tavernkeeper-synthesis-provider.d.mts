import type { TavernKeeperScanReportV5 } from "./tavernkeeper-reports.mjs";
import type { TavernaryAssessmentRepair } from "./tavernkeeper-assessment-contract.mjs";

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
    repair?: TavernaryAssessmentRepair & { diagnostic: string };
  }): Promise<{
    output: unknown;
    metadata: {
      requestedModel: string;
      returnedModel: string | null;
      latencyMs: number;
    };
  }>;
};
