import type { TavernKeeperScanReportV5 } from "./tavernkeeper-reports.mjs";
import type { TavernaryAssessmentRepair } from "./tavernkeeper-assessment-contract.mjs";
import type {
  JsonRepairMetadata,
  ProviderConfiguration,
} from "../catalog/enrichment-provider.mjs";

export function tavernKeeperSynthesisInstructions(): string;
export function createTavernKeeperSynthesisProvider(
  options: ProviderConfiguration & {
    jsonRepair?: ProviderConfiguration;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
  },
): {
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
      jsonRepair?: JsonRepairMetadata;
    };
  }>;
};
