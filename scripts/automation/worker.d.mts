import type { AutomationOperation } from "./operation.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export type AutomationWorkerPlan =
  | { action: "wait" | "finished" | "superseded" }
  | { action: "dispatch"; workflow: string; inputs: Record<string, string> };
export function planAutomationWorker(
  operation: AutomationOperation,
  options?: { budgetTicket?: string },
): AutomationWorkerPlan;
export function runAutomationWorker(input: {
  operationKey: string;
  load: () => Promise<AutomationOperation[]>;
  gh: GhRunner;
  repository?: string;
  budgetTicket?: string;
}): Promise<AutomationWorkerPlan>;
