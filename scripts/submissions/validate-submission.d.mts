import type { SourceIdentity } from "./source-identity.mjs";

export interface SubmissionInput {
  kind: string;
  sourceUrl: string;
  existingSources: string[];
}

export interface SubmissionValidation {
  labels: string[];
  errors: string[];
}

export interface ResolvedSubmissionInput {
  projectType: "frontend" | "extension" | "preset";
  identity: SourceIdentity;
  existingIdentities: SourceIdentity[];
}

export interface ResolvedSubmissionValidation {
  duplicate: boolean;
  errors: string[];
}

export function validateSubmission(
  input: SubmissionInput,
): SubmissionValidation;
export function validateSubmission(
  input: ResolvedSubmissionInput,
): ResolvedSubmissionValidation;
