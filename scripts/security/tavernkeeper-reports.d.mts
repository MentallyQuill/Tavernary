export interface TavernKeeperReport {
  report_id: string;
  report_version: number;
  supersedes_report_id: string | null;
  scanner_version: string;
  scanner_policy_version: string;
  prompt_policy_version: string;
  source_id: string;
  provider: "github";
  repository_id: number;
  repository: string;
  target_sha: string;
  completed_at: string;
  mode: "standard" | "deep";
  result: "green" | "yellow";
  finding_counts: {
    total: number;
    actionable: number;
    severity: Record<"critical" | "high" | "medium" | "low" | "info", number>;
    confidence: Record<"high" | "medium" | "low", number>;
    disposition: Record<"active" | "dismissed", number>;
    categories: Array<{ category: string; count: number }>;
  };
  coverage: Record<string, number>;
  report_url: string;
}

export interface TavernKeeperReportIndex {
  schema_version: 1;
  generated_at: string;
  reports: TavernKeeperReport[];
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
export const ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION: "1";

export function validateReportIndex(
  index: unknown,
  registry:
    | TavernKeeperSourceRegistryEntry[]
    | { sources: TavernKeeperSourceRegistryEntry[] },
): TavernKeeperReportIndex;

export function fetchAndValidateTavernKeeperIndex(options?: {
  url?: string;
  fetchImpl?: typeof fetch;
  dnsLookup?: (
    hostname: string,
    options: { all: true },
  ) => Promise<Array<{ address: string; family: number }>>;
}): Promise<TavernKeeperReportIndex>;

export function writeReportSummaries(
  index: TavernKeeperReportIndex,
  outputPath: string,
): Promise<void>;
