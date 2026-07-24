export interface SubmissionInput {
  kind: string;
  sourceUrl: string;
  existingSources: string[];
}

export interface SubmissionValidation {
  labels: string[];
  errors: string[];
}

export function validateSubmission(
  input: SubmissionInput,
): SubmissionValidation;
