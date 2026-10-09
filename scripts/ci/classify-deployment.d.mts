import type { PullRequestCiRoute } from "./classify-pr-paths.mjs";
export function classifyDeploymentPaths(
  paths: Iterable<string>,
): PullRequestCiRoute;
export function runDeploymentClassification(input?: {
  root?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  route: PullRequestCiRoute;
  reason: string;
  baselineSha: string | null;
}>;
