export type TavernKeeperImportErrorCode =
  | "REPORT_FETCH_FAILED"
  | "REPORT_IDENTITY_CONFLICT"
  | "REPORT_SYNTHESIS_FAILED"
  | "REPORT_TRACKING_FAILED";

export interface TavernKeeperPendingImport {
  report_id: string;
  repository_id: number;
  target_sha: string;
  ticket: number;
  consecutive_failures: number;
  total_failures: number;
  not_before: string | null;
  last_error_code: TavernKeeperImportErrorCode | null;
  last_failed_at: string | null;
  chronic: boolean;
}

export interface TavernKeeperImportState {
  schema_version: 1;
  updated_at: string;
  source_generated_at: string;
  next_ticket: number;
  pending: TavernKeeperPendingImport[];
}

export function initialTavernKeeperImportState(
  at?: string,
): TavernKeeperImportState;
export function validateTavernKeeperImportState(
  value: unknown,
): TavernKeeperImportState;
export function readTavernKeeperImportState(
  path: string,
): Promise<TavernKeeperImportState>;
export function blankPendingImport(
  entry: { report_id: string; repository_id: number; target_sha: string },
  ticket: number,
): TavernKeeperPendingImport;
export function rotatePendingImport(
  state: TavernKeeperImportState,
  entry: TavernKeeperPendingImport,
  errorCode: TavernKeeperImportErrorCode,
  at: string,
): TavernKeeperImportState;
