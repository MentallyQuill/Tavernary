import type { GitHubRequest } from "../submissions/reconcile-project-validations.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export function createProjectReconciliationRequest(input: {
  repository: string;
  request: GitHubRequest;
  gh: GhRunner;
  publish: () => Promise<unknown>;
  issueNumber?: number;
  generationWorkflow?:
    "generate-project-submission.yml" | "generate-project-owner-request.yml";
  prepareGeneration?: () => Promise<unknown>;
}): GitHubRequest;
