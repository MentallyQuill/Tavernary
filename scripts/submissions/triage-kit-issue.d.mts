import type { KitSubmissionValidation } from "./validate-kit-submission.mjs";

export function parseKitIssueFields(body: string): { manifest: string };
export function buildKitValidationComment(
  validation: KitSubmissionValidation,
): string;
