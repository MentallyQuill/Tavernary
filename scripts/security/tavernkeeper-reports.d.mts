export interface TavernKeeperReportV4 {
  report_id: string;
  report_version: number;
  supersedes_report_id: string | null;
  scanner_version: string;
  scanner_policy_version: string;
  rule_catalog_version: string;
  package_schema_version: number;
  source_id: string;
  provider: "github";
  repository_id: number;
  repository: string;
  target_sha: string;
  completed_at: string;
  assessment_method: "deterministic-static-analysis";
  result: "teal" | "red";
  summary: { headline: string; detail: string };
  finding_counts: {
    total: number;
    reportable: number;
    informational: number;
    reportable_severity: Record<"critical" | "high" | "medium", number>;
    severity: Record<"critical" | "high" | "medium" | "low" | "info", number>;
    confidence: Record<"high" | "medium" | "low", number>;
    policy_status: Record<"reportable" | "informational", number>;
    categories: Array<{ category: string; count: number }>;
  };
  coverage: {
    history_commits: number;
    inventory_files: number;
    inventory_bytes: number;
    tools_completed: number;
    tools_not_applicable: number;
    evidence_validated: number;
  };
  report_url: string;
  history_url: string;
}

export interface TavernKeeperReportIndexV4 {
  schema_version: 4;
  generated_at: string;
  reports: TavernKeeperReportV4[];
}

export interface TavernKeeperSourceRegistryEntry {
  id: string;
  type: string;
  status: string;
  repository_id: number | null;
  repository: string;
}

export const TAVERNKEEPER_ORIGIN: "https://mentallyquill.github.io";
export const TAVERNKEEPER_REPORTS_PATH_PREFIX: "/TavernKeeper/reports/";
export const TAVERNKEEPER_REPORT_INDEX_URL: "https://mentallyquill.github.io/TavernKeeper/reports/index.json";
export const ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION: "2";

export function validateReportIndex(
  index: unknown,
  registry:
    | TavernKeeperSourceRegistryEntry[]
    | { sources: TavernKeeperSourceRegistryEntry[] },
): TavernKeeperReportIndexV4;

export function validateStoredReportIndex(
  index: unknown,
  registry:
    | TavernKeeperSourceRegistryEntry[]
    | { sources: TavernKeeperSourceRegistryEntry[] },
): TavernKeeperReportIndexV4;

export function fetchAndValidateTavernKeeperIndex(options?: {
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
}): Promise<TavernKeeperReportIndexV4>;

export function writeReportSummaries(
  index: TavernKeeperReportIndexV4,
  outputPath: string,
): Promise<void>;
