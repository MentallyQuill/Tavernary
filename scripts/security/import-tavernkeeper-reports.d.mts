import type {
  TavernKeeperAssessmentSnapshotV5,
  TavernKeeperScanReportV5,
  TavernKeeperSourceRegistryEntry,
  TavernarySynthesisProjection,
} from "./tavernkeeper-reports.mjs";
import type { TavernKeeperImportState } from "./tavernkeeper-import-state.mjs";

export interface TavernKeeperImportOptions {
  root?: string;
  outputPath?: string;
  importStatePath?: string;
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
  batchSize?: number;
  now?: () => Date;
}

export interface TavernKeeperImportOutcome {
  snapshot: TavernKeeperAssessmentSnapshotV5;
  import_state: TavernKeeperImportState;
  imported: number;
  failed: number;
  pending_due: number;
  pending_delayed: number;
  next_wake_at: string | null;
  chronic_failures: number;
}

export function reconcileTavernKeeperReports(
  options?: TavernKeeperImportOptions,
): Promise<TavernKeeperImportOutcome>;
export function importTavernKeeperReports(
  options?: TavernKeeperImportOptions,
): Promise<TavernKeeperAssessmentSnapshotV5>;
