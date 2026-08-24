import type {
  ProjectValidationState,
  ProjectValidationRun,
} from "./project-validation-reconciliation.mjs";

export type GitHubRequest = (
  path: string,
  options?: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  },
) => Promise<unknown>;

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
      outcome: "applied" | "observed";
    }
  | {
      pullNumber: number;
      issueNumber: number;
      action: "ignore";
      outcome: "stale";
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
}): Promise<ReconciliationSummary>;
