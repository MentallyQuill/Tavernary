export interface ProjectGenerationFailurePlan {
  action: "noop" | "reconcile";
  labels?: string[];
  commentMarker?: string;
  commentBody?: string;
}

export function planProjectGenerationFailure(input: {
  issue: {
    number: number;
    state: string;
    labels: Array<string | { name: string }>;
  };
  producer: "project-submission" | "project-owner-request";
  ownedPull: { state: string } | null;
  runUrl: string;
  reasonCode: string;
  redditRetryState?:
    import("./project-submission-retry-state.mjs").RedditRetryState | null;
}): ProjectGenerationFailurePlan;

export function reconcileProjectGenerationFailure(input: {
  repository: string;
  issueNumber: number;
  producer: "project-submission" | "project-owner-request";
  runUrl: string;
  reasonCode: string;
  redditRetryState?:
    import("./project-submission-retry-state.mjs").RedditRetryState | null;
  request: (path: string, options?: Record<string, unknown>) => Promise<any>;
}): Promise<ProjectGenerationFailurePlan>;
