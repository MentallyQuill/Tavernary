import type {
  TavernKeeperAssessmentSnapshotV6,
  TavernKeeperScanReportV5,
  TavernKeeperSourceRegistryEntry,
  TavernarySynthesisProjection,
} from "./tavernkeeper-reports.mjs";
import type {
  TavernKeeperImportState,
  TavernaryAssessmentDiagnostic,
} from "./tavernkeeper-import-state.mjs";

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
  jsonRepair?: {
    apiUrl?: string;
    apiKey?: string;
    model?: string;
  };
  providerFetchImpl?: typeof fetch;
  providerTimeoutMs?: number;
  providerNow?: () => number;
  assessmentNow?: () => Date;
  synthesisMaxAttempts?: number;
  batchSize?: number;
  now?: () => Date;
  retryReportDigest?: string;
}

export interface TavernKeeperImportIncident {
  incident_key: string;
  report_id: string;
  report_digest: string;
  repository_id: number;
  repository: string;
  target_sha: string;
  synthesis_policy_version: string;
  diagnostic: TavernaryAssessmentDiagnostic;
  attempts: number;
}

export interface TavernKeeperImportOutcome {
  snapshot: TavernKeeperAssessmentSnapshotV6;
  import_state: TavernKeeperImportState;
  imported: number;
  retained: number;
  quarantined: number;
  skipped_quarantines: number;
  remaining: number;
  created_or_updated: TavernKeeperImportIncident[];
  resolved: TavernKeeperImportIncident[];
}

export function reconcileTavernKeeperReports(
  options?: TavernKeeperImportOptions,
): Promise<TavernKeeperImportOutcome>;
export function importTavernKeeperReports(
  options?: TavernKeeperImportOptions,
): Promise<TavernKeeperAssessmentSnapshotV6>;
