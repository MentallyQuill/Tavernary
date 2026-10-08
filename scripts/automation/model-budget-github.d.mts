import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { ModelBudgetGuard } from "./model-budget.mjs";
export function dispatchReservedModelPreparation(input: {
  gh: GhRunner;
  repository: string;
  publisherActorId: number;
  operationKey: string;
  workflow: string;
  sourceSha: string;
  ticketIds: string[];
  projectId?: string;
  nowMs: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ runId: number; workflow: string }>;
export function loadProducerBudgetGuard(input: {
  env: Record<string, string | undefined>;
  operationKey: string;
  ticketIds: string[];
  gh: GhRunner;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ModelBudgetGuard>;
export function dispatchUnbudgetedPreparation(
  input: Omit<
    Parameters<typeof dispatchReservedModelPreparation>[0],
    "ticketIds"
  >,
): Promise<{ runId: number; workflow: string }>;
