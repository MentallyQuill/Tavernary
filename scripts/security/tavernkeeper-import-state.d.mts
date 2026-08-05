export type TavernaryAssessmentDiagnostic =
  | "response_schema"
  | "public_text_references"
  | "unknown_candidate_ids"
  | "missing_candidate_ids"
  | "count_mismatch"
  | "interaction_chain_ids"
  | "below_evidence_floor"
  | "unsupported_escalation"
  | "provider_response_invalid";

export interface TavernKeeperReportQuarantine {
  report_id: string;
  report_digest: string;
  repository_id: number;
  repository: string;
  target_sha: string;
  synthesis_policy_version: string;
  diagnostic: TavernaryAssessmentDiagnostic;
  first_failed_at: string;
  last_failed_at: string;
  attempts: number;
}

export interface TavernKeeperImportState {
  schema_version: 2;
  updated_at: string;
  quarantines: TavernKeeperReportQuarantine[];
}

export interface LegacyTavernKeeperImportState {
  schema_version: 1;
  updated_at: string;
  source_generated_at: string;
  next_ticket: number;
  pending: Array<{
    report_id: string;
    repository_id: number;
    target_sha: string;
    ticket: number;
    consecutive_failures: number;
    total_failures: number;
    not_before: string;
    last_error_code:
      | "REPORT_FETCH_FAILED"
      | "REPORT_IDENTITY_CONFLICT"
      | "REPORT_SYNTHESIS_FAILED"
      | "REPORT_TRACKING_FAILED";
    last_failed_at: string;
    chronic: boolean;
  }>;
}

export function initialTavernKeeperImportState(
  at?: string,
): TavernKeeperImportState;
export function validateTavernKeeperImportState(
  value: unknown,
): TavernKeeperImportState;
export function readTavernKeeperImportState(
  path: string,
): Promise<TavernKeeperImportState | LegacyTavernKeeperImportState>;
export function migrateTavernKeeperImportState(
  value: TavernKeeperImportState | LegacyTavernKeeperImportState,
  index: {
    reports: Array<{
      report_id: string;
      report_digest: string;
      repository_id: number;
      repository: string;
      target_sha: string;
    }>;
  },
  at: string,
): TavernKeeperImportState;
export function quarantineTavernKeeperReport(
  state: TavernKeeperImportState,
  entry: {
    report_id: string;
    report_digest: string;
    repository_id: number;
    repository: string;
    target_sha: string;
  },
  synthesisPolicyVersion: string,
  diagnostic: TavernaryAssessmentDiagnostic,
  at: string,
): TavernKeeperImportState;
export function removeTavernKeeperQuarantine(
  state: TavernKeeperImportState,
  reportDigest: string,
  synthesisPolicyVersion: string,
  at: string,
): TavernKeeperImportState;
export function reportSynthesisIncidentKey(
  reportDigest: string,
  synthesisPolicyVersion: string,
): string;
