import type { KitSubmissionValidation } from "./validate-kit-submission.mjs";
import type { TrustedEditorRegistry } from "../maintenance/trusted-editor-authority.mjs";

export interface KitSubmissionIssue {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  labels: Array<string | { name: string }>;
  user: { id: number; login: string };
  author_association?: string;
}

export function parseKitIssueFields(body: string): { manifest: string };
export function validateKitIssue(input: {
  issue: Pick<
    KitSubmissionIssue,
    "number" | "body" | "user" | "author_association"
  >;
  projects: Array<{ id: string; kind: string; visibility?: string }>;
  kits: Array<{
    id: string;
    status: string;
    author: { github_user_id: number; login: string };
    source_issue_number?: number;
    project_ids: string[];
  }>;
  blockedUsers: {
    schema_version?: number;
    blocked: Array<{ github_user_id: number; login: string; reason: string }>;
  };
  trustedEditors?: TrustedEditorRegistry;
}): KitSubmissionValidation;
export function buildKitValidationComment(
  validation: KitSubmissionValidation,
): string;
export function assertKitSubmissionEligible(
  issue: Pick<KitSubmissionIssue, "state" | "labels">,
): void;
export function kitTriageOutputs(
  validation: KitSubmissionValidation,
  issue: { number: number },
): { publish: string; issue_number: string };
export function synchronizeKitSubmission(
  repository: string,
  issueNumber: number,
  validation: KitSubmissionValidation,
  request?: (
    path: string,
    options?: { method?: string; body?: string },
  ) => Promise<any>,
): Promise<void>;

export function resolveKitSubmissionEvent(
  event: unknown,
  environment: Record<string, string | undefined>,
  request: (path: string) => Promise<KitSubmissionIssue>,
): Promise<{
  repository: { full_name: string };
  issue: KitSubmissionIssue;
} | null>;
