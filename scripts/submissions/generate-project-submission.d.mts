export interface GeneratedSubmissionFile {
  path: string;
  value: unknown;
}

export interface GeneratedSubmissionReport {
  schema_version: 1;
  issue_number: number;
  project_id: string;
  source_provider: "github" | "codeberg" | null;
  submitted: Record<string, unknown>;
  observed: Record<string, unknown>;
  inferred: Record<string, unknown>;
  summary_authority:
    | import("./submission-summary-authority.mjs").SubmissionSummaryAuthority
    | null;
  copy_result: {
    result: import("../catalog/catalog-copy-contract.mjs").CatalogCopyResultStatus;
    change_reasons: import("../catalog/catalog-copy-contract.mjs").CatalogCopyChangeReason[];
    policy_signal: import("../catalog/catalog-copy-contract.mjs").CatalogCopyPolicySignal;
  } | null;
  input_digest: string | null;
  source_identity: {
    type: "github" | "codeberg" | "reddit" | "external";
    canonical: string;
    repository_id: number | null;
  } | null;
  actor: { id: number; login: string; type: "User" | "Bot" } | null;
  classificationReview: GeneratedClassificationReview | null;
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
  summaryAuthority?: import("./submission-summary-authority.mjs").SubmissionSummaryAuthority;
  copyResult?: GeneratedSubmissionReport["copy_result"];
  inputDigest?: string;
  sourceIdentity?: NonNullable<GeneratedSubmissionReport["source_identity"]>;
  classificationReview?: GeneratedClassificationReview | null;
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
  user?: {
    id?: number | null;
    login?: string | null;
    type?: string | null;
  } | null;
  author_association?: string | null;
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
import type { GeneratedClassificationReview } from "./draft-project-record.mjs";
