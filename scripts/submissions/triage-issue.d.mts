import type { SubmissionValidation } from "./validate-submission.mjs";

export function parseIssueFields(body: string): {
  kind: string;
  sourceUrl: string;
};

export function buildValidationComment(
  validation: SubmissionValidation,
): string;
