import type {
  TavernKeeperAssessmentSnapshotV5,
  TavernKeeperScanReportV5,
  TavernKeeperSourceRegistryEntry,
  TavernarySynthesisProjection,
} from "./tavernkeeper-reports.mjs";

export function importTavernKeeperReports(options?: {
  root?: string;
  outputPath?: string;
  timeoutMs?: number;
  registry?: TavernKeeperSourceRegistryEntry[];
  fetchImpl?: typeof fetch;
  requestImpl?: Parameters<
    typeof import("./tavernkeeper-reports.mjs").fetchAndValidateTavernKeeperIndex
  >[0]["requestImpl"];
  dnsLookup?: (
    hostname: string,
    options: { all: true },
  ) => Promise<Array<{ address: string; family: number }>>;
  synthesizeReport?: (
    report: TavernKeeperScanReportV5,
  ) => Promise<TavernarySynthesisProjection>;
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  providerFetchImpl?: typeof fetch;
  providerTimeoutMs?: number;
  providerNow?: () => number;
  assessmentNow?: () => Date;
  synthesisMaxAttempts?: number;
}): Promise<TavernKeeperAssessmentSnapshotV5>;
