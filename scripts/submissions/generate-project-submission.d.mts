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

export function generateProjectSubmission(input: {
  issueNumber: number;
  draft: {
    record: { id: string; [key: string]: unknown };
    snapshot?: unknown;
    frontendVocabulary?: {
      frontends: Array<{ id: string; [key: string]: unknown }>;
    };
    submitted: Record<string, unknown>;
    observed: Record<string, unknown>;
    inferred: Record<string, unknown>;
    warnings: string[];
  };
}): Promise<GeneratedSubmission>;
