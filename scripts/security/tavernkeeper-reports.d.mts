export type TavernKeeperRiskLevel = "low" | "material" | "high";
export type TavernKeeperExecutionScope =
  | "runtime"
  | "install-update"
  | "automation"
  | "tooling-only"
  | "test-documentation-data"
  | "unknown";
export type TavernKeeperReviewAssessmentSource =
  "deterministic-policy" | "contextual-model";

export interface TavernKeeperContextualCountsV5 {
  candidates: number;
  assessments: number;
  observations: number;
  items: number;
  disposition: Record<
    | "expected_behavior"
    | "minor_weakness"
    | "material_vulnerability"
    | "credible_malicious_behavior",
    number
  >;
  impact: Record<"none" | "low" | "medium" | "high" | "critical", number>;
  exploitability: Record<
    "unlikely" | "plausible" | "readily_exploitable",
    number
  >;
  confidence: Record<"low" | "medium" | "high", number>;
  recommended_risk: Record<TavernKeeperRiskLevel, number>;
}

export interface TavernKeeperReportIndexEntryV5 {
  report_id: string;
  report_digest: string;
  report_version: number;
  supersedes_report_id: string | null;
  scanner_version: string;
  scanner_policy_version: string;
  rule_catalog_version: string;
  package_schema_version: number;
  contextual_review_policy_version: string;
  ecosystem_context_version: string;
  prompt_version: string;
  assessment_schema_version: string;
  source_id: string;
  provider: "github";
  repository_id: number;
  repository: string;
  target_sha: string;
  completed_at: string;
  assessment_method: "deterministic-evidence-contextual-review";
  counts: TavernKeeperContextualCountsV5;
  coverage: {
    history_commits: number;
    inventory_files: number;
    inventory_bytes: number;
    tools_completed: number;
    tools_not_applicable: number;
    evidence_validated: number;
    metadata_only_candidates: number;
    review_required: number;
    review_completed: number;
    javascript_analysis_status: "complete" | "incomplete" | "legacy";
  };
  report_url: string;
  history_url: string;
}

export interface TavernKeeperReportIndexV5 {
  schema_version: 5;
  generated_at: string;
  reports: TavernKeeperReportIndexEntryV5[];
}

export interface TavernKeeperContextualItemV5 {
  candidate_id: string;
  disposition:
    | "expected_behavior"
    | "minor_weakness"
    | "material_vulnerability"
    | "credible_malicious_behavior";
  impact: "none" | "low" | "medium" | "high" | "critical";
  exploitability: "unlikely" | "plausible" | "readily_exploitable";
  confidence: "low" | "medium" | "high";
  recommended_risk: TavernKeeperRiskLevel;
  risk_exposure?: "not_demonstrated" | "demonstrated";
  assessment_source?: TavernKeeperReviewAssessmentSource;
  triage_reason_code?: string;
  [key: string]: unknown;
}

export interface TavernKeeperScanReportV5 {
  schema_version: 5;
  report_id: string;
  report_digest: string;
  report_version: number;
  supersedes_report_id: string | null;
  scanner_version: string;
  scanner_policy_version: string;
  rule_catalog_version: string;
  package_schema_version: number;
  contextual_review_policy_version: string;
  ecosystem_context_version: string;
  prompt_version: string;
  assessment_schema_version: string;
  source_id: string;
  provider: "github";
  repository_id: number;
  repository: string;
  canonical_url: string;
  target_sha: string;
  completed_at: string;
  assessment_method: "deterministic-evidence-contextual-review";
  contextual_reviewer?: {
    provider: string;
    model: string;
  };
  review_usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    reasoning_tokens: number;
  };
  review_batches?: Array<{
    kind: "contextual_review" | "json_repair";
    attempt: number;
    group_count: number;
    candidate_count: number;
    estimated_input_tokens: number | null;
    over_budget: boolean;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    reasoning_tokens: number;
  }>;
  review_triage?: {
    policy_version: "1";
    candidates: {
      total: number;
      deterministic: number;
      contextual: number;
      reused_contextual: number;
    };
    cases: {
      total: number;
      contextual: number;
      reused_contextual: number;
    };
    reasons: Array<{ reason_code: string; count: number }>;
    model_budget: {
      review_protocol_version?: 2;
      configured: {
        max_fresh_behavior_cases: 12;
        max_provider_calls: 6;
        max_estimated_input_tokens: 200000;
        max_actual_input_tokens: 250000;
        max_actual_output_tokens: 40000;
      };
      actual: {
        fresh_behavior_cases: number;
        provider_calls: number;
        estimated_input_tokens: number;
        input_tokens: number;
        output_tokens: number;
      };
    };
  };
  counts: TavernKeeperContextualCountsV5;
  coverage: {
    evidence_validation: {
      status: "completed" | "completed-with-limitations";
      validated_candidates: number;
      metadata_only_candidates?: number;
    };
    javascript_analysis?: {
      status: "complete" | "incomplete";
      candidates: number;
      candidate_bytes: number;
      representations: {
        raw: number;
        decoded: number;
        normalized: number;
        bundle_modules: number;
      };
      stages: {
        raw_signatures: number;
        raw_ast: number;
        raw_opengrep: number;
        derived_signatures: number;
        derived_ast: number;
        derived_opengrep: number;
      };
      unresolved: Array<{
        path: string;
        stage: string;
        reason: string;
        recovered: boolean;
      }>;
    };
    [key: string]: unknown;
  };
  candidates: Array<{
    candidate_id: string;
    origin: string;
    rule_id: string;
    category: string;
    scanner_severity: string;
    scanner_confidence: string;
    file_role: string;
    execution_scope?: TavernKeeperExecutionScope;
    title: string;
    explanation: string;
    [key: string]: unknown;
  }>;
  review_coverage: {
    required: number;
    completed: number;
  };
  review_reuse?: {
    groups: { fresh: number; reused: number };
    candidates: { fresh: number; reused: number };
    source_report_ids: string[];
  };
  assessments: TavernKeeperContextualItemV5[];
  observations: Array<
    Omit<TavernKeeperContextualItemV5, "candidate_id"> & {
      observation_id: string;
      related_candidate_ids: string[];
      title: string;
      [key: string]: unknown;
    }
  >;
  limitations: string[];
  [key: string]: unknown;
}

export interface TavernaryAssessmentV1 {
  risk_level: TavernKeeperRiskLevel;
  headline: string;
  summary: string;
  minor_cautions: number;
  material_concerns: number;
  high_danger: number;
  malicious_evidence: string;
  cited_finding_ids: string[];
  interaction_chains: Array<{
    finding_ids: string[];
    resulting_risk: "material" | "high";
    explanation: string;
  }>;
}

export interface TavernarySynthesisProjection {
  report_id: string;
  target_sha: string;
  assessed_at: string;
  synthesis_policy_version: string;
  synthesis_model: string;
  assessment: TavernaryAssessmentV1;
}

export type TavernKeeperDangerBasis =
  | "none"
  | "malicious_or_compromised"
  | "critical_exploitable_vulnerability"
  | "mixed";
export type TavernKeeperAssessmentSource =
  "model" | "deterministic_fallback" | "deterministic_regrade";

export interface TavernaryAssessedReportV6 extends TavernKeeperReportIndexEntryV5 {
  assessed_at: string;
  synthesis_policy_version: string;
  synthesis_model: string;
  danger_basis: TavernKeeperDangerBasis;
  assessment_source: TavernKeeperAssessmentSource;
  assessment: TavernaryAssessmentV1;
}

export interface TavernKeeperAssessmentSnapshotV6 {
  schema_version: 6;
  generated_at: string;
  preferred_report_ids: string[];
  reports: TavernaryAssessedReportV6[];
}

export interface TavernKeeperSourceRegistryEntry {
  id: string;
  type: string;
  status: string;
  repository_id: number | null;
  repository: string;
}

export interface TavernKeeperFetchOptions {
  url?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  requestImpl?: (
    url: string,
    options: {
      headers: Record<string, string>;
      signal: AbortSignal;
      lookup: (
        hostname: string,
        options: { all?: boolean },
        callback: (
          error: Error | null,
          address?: string | Array<{ address: string; family: number }>,
          family?: number,
        ) => void,
      ) => void;
    },
  ) => Promise<Response>;
  dnsLookup?: (
    hostname: string,
    options: { all: true },
  ) => Promise<Array<{ address: string; family: number }>>;
}

export const TAVERNKEEPER_ORIGIN: "https://mentallyquill.github.io";
export const TAVERNKEEPER_REPORTS_PATH_PREFIX: "/TavernKeeper/reports/";
export const TAVERNKEEPER_REPORT_INDEX_URL: "https://mentallyquill.github.io/TavernKeeper/reports/index.json";
export const ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION: "5";

export function computeReportDigest(reportBody: object): string;
export function validateReportIndex(
  index: unknown,
  registry:
    | TavernKeeperSourceRegistryEntry[]
    | { sources: TavernKeeperSourceRegistryEntry[] },
  options?: { pruneDelisted?: boolean },
): TavernKeeperReportIndexV5;
export function validateScanReport(
  report: unknown,
  entry: TavernKeeperReportIndexEntryV5,
): TavernKeeperScanReportV5;
export function validateStoredReportIndex(
  index: unknown,
  registry:
    | TavernKeeperSourceRegistryEntry[]
    | { sources: TavernKeeperSourceRegistryEntry[] },
): TavernKeeperAssessmentSnapshotV6;
export function fetchAndValidateTavernKeeperIndex(
  options?: TavernKeeperFetchOptions,
): Promise<TavernKeeperReportIndexV5>;
export function fetchAndValidateTavernKeeperReport(
  entry: TavernKeeperReportIndexEntryV5,
  options?: TavernKeeperFetchOptions,
): Promise<TavernKeeperScanReportV5>;
export function readStoredReportIndex(
  path: string,
  registry:
    | TavernKeeperSourceRegistryEntry[]
    | { sources: TavernKeeperSourceRegistryEntry[] },
): Promise<TavernKeeperAssessmentSnapshotV6>;
export function writeReportSummaries(
  index: TavernKeeperAssessmentSnapshotV6,
  outputPath: string,
): Promise<void>;
