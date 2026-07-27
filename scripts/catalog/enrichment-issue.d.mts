export const ENRICHMENT_ISSUE_TITLE: "Catalog enrichment errors";
export const ENRICHMENT_ISSUE_LABEL: "catalog-enrichment-errors";
export const ENRICHMENT_ISSUE_MARKER: "<!-- tavernary:catalog-enrichment-errors -->";

export type EnrichmentIssueNotice = {
  title: typeof ENRICHMENT_ISSUE_TITLE;
  label: typeof ENRICHMENT_ISSUE_LABEL;
  marker: typeof ENRICHMENT_ISSUE_MARKER;
  unresolved: Array<{
    id: string;
    outcome: string;
    reasonCode: string;
    detail: string;
  }>;
  annotations: string[];
  body: string;
};

export type CommandResult = {
  stdout: string;
  stderr?: string;
  exitCode: number;
};

export type RunCommand = (
  command: string,
  args: string[],
) => Promise<CommandResult>;

export type EnrichmentIssueReport = {
  status: string;
  entries: Record<
    string,
    {
      id?: unknown;
      outcome?: unknown;
      reason_code?: unknown;
      message?: unknown;
      [key: string]: unknown;
    }
  >;
  manual_exclusions?: readonly unknown[];
};

export function buildEnrichmentIssueNotice(input: {
  rolloutResult: { status: "complete" | "complete-with-errors" };
  report: EnrichmentIssueReport | null;
  runUrl: string;
  runAt: string;
}): EnrichmentIssueNotice;

export function syncEnrichmentIssue(input: {
  notice: EnrichmentIssueNotice;
  repository: string;
  bodyPath: string;
  runCommand: RunCommand;
  writeFile(path: string, content: string): Promise<void>;
  runUrl: string;
}): Promise<void>;

export function runEnrichmentIssueCli(options: {
  resultPath: string;
  reportPath: string;
  environment?: Record<string, string | undefined>;
  readJson?(path: string): Promise<any>;
  validateReport?(value: unknown): EnrichmentIssueReport;
  runCommand?: RunCommand;
  writeFile?(path: string, content: string): Promise<void>;
  writeOutput?(value: string): void;
  now?: string;
}): Promise<{
  status: "complete" | "complete-with-errors";
  unresolved: number;
}>;

export function enrichmentIssueCliOptions(argv: string[]): {
  resultPath: string;
  reportPath: string;
};
