export type PullRequestCiRoute = "content" | "full";

export interface PullRequestCiClassification {
  route: PullRequestCiRoute;
  reason: "content-only" | "empty-diff" | "invalid-path" | "full-path";
  path?: string;
}

export function classifyPullRequestPaths(
  paths: Iterable<string>,
): PullRequestCiClassification;
