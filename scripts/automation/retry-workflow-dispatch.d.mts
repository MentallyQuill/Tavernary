import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { retryGithubRequest } from "./github-retry.mjs";
export function runWorkflowDispatchCli(
  args: string[],
  options?: Omit<Parameters<typeof retryGithubRequest>[1], "retryable"> & {
    gh?: GhRunner;
    write?: (value: string) => void;
    reportError?: (value: string) => void;
  },
): Promise<number>;
