export interface GeneratedSubmissionFile {
  path: string;
  value: unknown;
}

export interface GeneratedSubmissionReport {
  schema_version: 1;
  issue_number: number;
  project_id: string;
  submitted: Record<string, unknown>;
  observed: Record<string, unknown>;
  inferred: Record<string, unknown>;
  warnings: string[];
}

export interface GeneratedSubmission {
  files: GeneratedSubmissionFile[];
  report: GeneratedSubmissionReport;
}

export interface GeneratedSubmissionDraft {
  record: { id: string; [key: string]: unknown };
  snapshot?: unknown;
  frontendVocabulary?: {
    frontends: Array<{ id: string; [key: string]: unknown }>;
  };
  submitted: Record<string, unknown>;
  observed: Record<string, unknown>;
  inferred: Record<string, unknown>;
  warnings: string[];
}

export function generateProjectSubmission(input: {
  issueNumber: number;
  draft: GeneratedSubmissionDraft;
}): Promise<GeneratedSubmission>;

export interface GenerateProjectSubmissionCliOptions {
  issueNumber: number;
  outputDirectory: string;
  reportPath: string;
}

export interface GenerationIssue {
  number: number;
  state: string;
  body?: string | null;
  labels: Array<string | { name: string }>;
}

export interface ProjectSubmissionSourceClients {
  prepareDraft?: (input: {
    issue: GenerationIssue;
    now: string;
  }) => Promise<GeneratedSubmissionDraft>;
  [key: string]: unknown;
}

export function parseGenerateProjectSubmissionCli(
  argv: string[],
): GenerateProjectSubmissionCliOptions;

export function writeGeneratedSubmission(
  generated: GeneratedSubmission,
  options: Pick<
    GenerateProjectSubmissionCliOptions,
    "outputDirectory" | "reportPath"
  >,
): Promise<void>;

export function prepareProjectSubmissionDraft(input: {
  issue: GenerationIssue;
  now: string;
  sourceClients?: ProjectSubmissionSourceClients;
}): Promise<GeneratedSubmissionDraft>;

export function runGenerateProjectSubmissionCli(
  options: GenerateProjectSubmissionCliOptions & {
    fetchIssue?: (issueNumber: number) => Promise<GenerationIssue>;
    sourceClients?: ProjectSubmissionSourceClients;
    clock?: () => string;
  },
): Promise<GeneratedSubmission>;
