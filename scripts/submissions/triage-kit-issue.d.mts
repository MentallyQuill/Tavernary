import type { KitSubmissionValidation } from "./validate-kit-submission.mjs";

export interface KitSubmissionIssue {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  labels: Array<string | { name: string }>;
  user: { id: number; login: string };
}

export function parseKitIssueFields(body: string): { manifest: string };
export function buildKitValidationComment(
  validation: KitSubmissionValidation,
): string;
export function assertKitSubmissionEligible(
  issue: Pick<KitSubmissionIssue, "title" | "state" | "labels">,
): void;
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
