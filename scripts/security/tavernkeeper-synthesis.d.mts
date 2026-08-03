import type {
  TavernKeeperScanReportV5,
  TavernarySynthesisProjection,
} from "./tavernkeeper-reports.mjs";

export function synthesizeTavernKeeperReport(
  report: TavernKeeperScanReportV5,
  options: {
    provider: {
      configuration?: { model?: string };
      generate(input: {
        report: TavernKeeperScanReportV5;
        repair?: string;
      }): Promise<{
        output: unknown;
        metadata?: { requestedModel?: string };
      }>;
    };
    maxAttempts?: number;
    now?: () => Date;
  },
): Promise<TavernarySynthesisProjection>;
