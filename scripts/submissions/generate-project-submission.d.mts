export interface GeneratedSubmissionFile {
  path: string;
  value: unknown;
}

export interface GeneratedSubmissionReport {
  schema_version: 1;
  issue_number: number;
  project_id: string;
  source_id: string;
  source_provider: "github" | "codeberg" | null;
  submitted: Record<string, unknown>;
  observed: Record<string, unknown>;
  inferred: Record<string, unknown>;
  metadata_authority:
    | import("./submission-summary-authority.mjs").SubmissionMetadataAuthority
    | null;
  publication_mode: "automatic" | "manual";
  copy_mode: "preserve" | "synthesize" | null;
  copy_result: {
    result: import("../catalog/catalog-copy-contract.mjs").CatalogCopyResultStatus;
    change_reasons: import("../catalog/catalog-copy-contract.mjs").CatalogCopyChangeReason[];
    policy_signal: import("../catalog/catalog-copy-contract.mjs").CatalogCopyPolicySignal;
  } | null;
  copy_review_status: "validated" | "unavailable" | null;
  copy_review_diagnostic?:
    | import("../catalog/catalog-copy-diagnostic.mjs").CopyReviewDiagnostic
    | null;
  copy_review_reason_code: "copy-review-unavailable" | null;
  input_digest: string | null;
  source_identity: {
    type: "github" | "codeberg" | "reddit" | "external";
    canonical: string;
    repository_id: number | null;
  } | null;
  actor: { id: number; login: string; type: "User" | "Bot" } | null;
  classificationReview: GeneratedClassificationReview | null;
  reddit_retry?: RedditRetryReport | null;
  warnings: string[];
}

export interface RedditRetryReport {
  outcome: "source-ready" | "placeholder";
  wave_number: number;
  max_waves: 3;
  completed_waves: number;
  attempts: number;
  next_eligible_retry_at: null;
  reason_code: string | null;
}

export interface GeneratedSubmission {
  files: GeneratedSubmissionFile[];
  report: GeneratedSubmissionReport;
}

export interface GeneratedSubmissionDraft {
  record: { id: string; [key: string]: unknown };
  source: import("../../src/features/catalog/source-record.mjs").SourceRecord;
  snapshot?: unknown;
  frontendVocabulary?: {
    frontends: Array<{ id: string; [key: string]: unknown }>;
  };
  submitted: Record<string, unknown>;
  observed: Record<string, unknown>;
  inferred: Record<string, unknown>;
  metadataAuthority?: import("./submission-summary-authority.mjs").SubmissionMetadataAuthority;
  copyResult?: GeneratedSubmissionReport["copy_result"];
  copyMode?: GeneratedSubmissionReport["copy_mode"];
  copyReviewStatus?: NonNullable<
    GeneratedSubmissionReport["copy_review_status"]
  >;
  copyReviewDiagnostic?: import("../catalog/catalog-copy-diagnostic.mjs").CopyReviewDiagnostic;
  copyReviewReasonCode?: NonNullable<
    GeneratedSubmissionReport["copy_review_reason_code"]
  >;
  publicationMode?: GeneratedSubmissionReport["publication_mode"];
  inputDigest?: string;
  sourceIdentity?: NonNullable<GeneratedSubmissionReport["source_identity"]>;
  classificationReview?: GeneratedClassificationReview | null;
  redditRetry?: RedditRetryReport;
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
  retryStatePath?: string;
  failureDiagnosticPath?: string;
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

export class RedditSourceRetryScheduledError extends Error {
  name: "RedditSourceRetryScheduledError";
  code: "reddit-source-retry-scheduled";
  retryState: import("./project-submission-retry-state.mjs").RedditRetryState;
  attempts: number;
  constructor(input: {
    state: import("./project-submission-retry-state.mjs").RedditRetryState;
    attempts: number;
  });
}

export function redditPlaceholderSummary(
  kind: "frontend" | "extension" | "preset",
): string;

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
