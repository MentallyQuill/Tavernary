import type { AutomationInventoryState } from "./inventory.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { ProjectPublicationPlan } from "../publication/project-publication-planner.mjs";
import type { PublicationAction } from "./write-lane.mjs";
import type { PublicationResult } from "./publish.mjs";
export function loadProjectMergePlan(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  gh: GhRunner;
}): Promise<ProjectPublicationPlan>;
export function publishProjectOperation(input: {
  operationKey: string;
  load: () => Promise<AutomationInventoryState>;
  plan: (input: {
    state: AutomationInventoryState;
    operation: AutomationOperation;
  }) => Promise<ProjectPublicationPlan>;
  merge: (
    action: Extract<PublicationAction, { action: "merge" }>,
  ) => Promise<{ sha: string }>;
  persist: (receipt: AutomationReceipt) => Promise<void>;
}): Promise<PublicationResult>;
export function mergeExactProjectHead(input: {
  repository: string;
  gh: GhRunner;
  action: Extract<PublicationAction, { action: "merge" }>;
}): Promise<{ sha: string }>;
