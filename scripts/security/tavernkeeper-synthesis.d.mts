import type {
  TavernKeeperScanReportV5,
  TavernarySynthesisProjection,
} from "./tavernkeeper-reports.mjs";
import type { TavernaryAssessmentRepair } from "./tavernkeeper-assessment-contract.mjs";

export type TavernKeeperSynthesisFailureKind =
  "invalid-output" | "provider-transient" | "provider-security";
export class TavernKeeperSynthesisError extends Error {
  constructor(kind: TavernKeeperSynthesisFailureKind, diagnostic: string);
  kind: TavernKeeperSynthesisFailureKind;
  diagnostic: string;
}

export function synthesizeTavernKeeperReport(
  report: TavernKeeperScanReportV5,
  options: {
    provider: {
      configuration?: { model?: string };
      generate(input: {
        report: TavernKeeperScanReportV5;
        repair?: TavernaryAssessmentRepair & { diagnostic: string };
      }): Promise<{
        output: unknown;
        metadata?: { requestedModel?: string };
      }>;
    };
    maxAttempts?: number;
    now?: () => Date;
  },
): Promise<TavernarySynthesisProjection>;
