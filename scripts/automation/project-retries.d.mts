import type { AutomationInventoryState } from "./inventory.mjs";
import type {
  ProjectInventoryIssue,
  ProjectInventoryRun,
} from "./project-operations.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
interface RetryState {
  repository: string;
  publisherActorId: number;
  nowMs: number;
  remote: { issues: ProjectInventoryIssue[]; runs: ProjectInventoryRun[] };
  local: AutomationInventoryState["local"];
}
export function inspectProjectRetry(input: {
  state: RetryState;
  issue: ProjectInventoryIssue;
  gh: GhRunner;
}): Promise<{ resolved: boolean; notBefore: string | null }>;
export function inspectProjectRetries(input: {
  state: RetryState;
  gh: GhRunner;
  limit?: number;
}): Promise<{
  resolvedDependencies: Set<number>;
  deferredRetries: Map<number, string>;
  failures: number;
  inspectionComplete: boolean;
}>;
