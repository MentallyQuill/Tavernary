import type {
  ProjectValidationState,
  ProjectValidationRun,
} from "./project-validation-reconciliation.mjs";
import type { RetryDecision } from "../automation/retry.mjs";

export type GitHubRequest = (
  path: string,
  options?: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  },
) => Promise<unknown>;
export function githubRequest(
  path: string,
  options?: Parameters<GitHubRequest>[1],
  token?: string,
): Promise<unknown>;

export type ReconciliationResult =
  | {
      pullNumber: number | null;
      action: "ignore";
      reason: string;
      issueNumber?: number;
    }
  | {
      pullNumber: number;
      issueNumber: number;
      headSha: string;
      action:
        | "wait"
        | "validate"
        | "retry-validation"
        | "publish"
        | "retry-publication"
        | "regenerate"
        | "block";
      state: ProjectValidationState;
      attempts: number;
      runId: ProjectValidationRun["id"] | null;
      outcome: "applied" | "observed" | "superseded";
      projectionError?: string;
      retry?: RetryDecision;
    }
  | {
      pullNumber: number;
      issueNumber: number;
      action: "ignore";
      outcome: "stale";
      reason: string;
    }
  | {
      pullNumber: number;
      issueNumber: number;
      action: "error";
      error: string;
    };

export type ReconciliationSummary = {
  repository: string;
  defaultBranch: string;
  scannedPulls: number;
  results: ReconciliationResult[];
};

export function reconcileProjectValidations(input: {
  repository: string;
  request: GitHubRequest;
  nowMs: number;
  publisherActorId: number;
  selectedPullNumber?: number;
  loadAutomaticPublicationEnabled?: () => Promise<boolean>;
}): Promise<ReconciliationSummary>;

export function runReconcileProjectValidationsCli(input?: {
  env?: Record<string, string | undefined>;
  request?: GitHubRequest;
  gh?: import("./kit-submission-reconciliation.mjs").GhRunner;
  nowMs?: number;
  write?: (output: string) => void;
}): Promise<number>;
export function reconcileSubmissionHandoffs(input: {
  repository: string;
  gh: import("./kit-submission-reconciliation.mjs").GhRunner;
  load: (
    target: import("./reconcile-submission-finalization.mjs").SubmissionTarget,
  ) => Promise<import("../automation/inventory.mjs").AutomationInventoryState>;
  finalize: (
    target: import("./reconcile-submission-finalization.mjs").SubmissionTarget,
  ) => Promise<{ status: string }>;
  limit?: number;
}): Promise<{
  dispatched: number;
  processed: number;
  results: Array<Record<string, unknown>>;
}>;
