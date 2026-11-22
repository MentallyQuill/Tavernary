import type { AutomationFailure } from "../automation/failure.mjs";

export interface ProjectGenerationFailurePlan {
  action: "noop" | "reconcile" | "rejected";
  labels?: string[];
  commentMarker?: string;
  commentBody?: string;
  failure?: AutomationFailure;
  nextEligibleAt?: string | null;
}

export function planProjectGenerationFailure(input: {
  issue: {
    number: number;
    state: string;
    labels: Array<string | { name: string }>;
  };
  producer: "project-submission" | "project-owner-request";
  ownedPull: { state: string } | null;
  retryCopyReview?: boolean;
  runUrl: string;
  reasonCode: string;
  nowMs?: number;
  transientAttempts?: number;
  redditRetryState?:
    import("./project-submission-retry-state.mjs").RedditRetryState | null;
}): ProjectGenerationFailurePlan;

export function reconcileProjectGenerationFailure(input: {
  repository: string;
  publisherActorId?: number;
  issueNumber: number;
  producer: "project-submission" | "project-owner-request";
  runUrl: string;
  reasonCode: string;
  nowMs?: number;
  transientAttempts?: number;
  redditRetryState?:
    import("./project-submission-retry-state.mjs").RedditRetryState | null;
  issueBodySha256?: string;
  request: (path: string, options?: Record<string, unknown>) => Promise<any>;
}): Promise<ProjectGenerationFailurePlan>;

export interface ProjectGenerationDiagnostic {
  schema_version: 1;
  reason_code: string;
  issue_body_sha256?: string;
}

export function projectGenerationDiagnostic(
  error: unknown,
  issueBody?: string,
): ProjectGenerationDiagnostic;
export function parseProjectGenerationDiagnostic(
  serialized: string,
): ProjectGenerationDiagnostic | null;
