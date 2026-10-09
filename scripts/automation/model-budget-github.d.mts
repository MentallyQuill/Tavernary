import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { ModelBudgetGuard } from "./model-budget.mjs";
export function runGenerationWithBudgetEvidence<T>(input: {
  generate: () => Promise<T>;
  loader: Pick<
    ReturnType<typeof createProducerBudgetLoader>,
    "load" | "usage"
  > & { evidenceSaved?: () => boolean };
  env?: Record<string, string | undefined>;
  read?: (path: string, encoding: "utf8") => Promise<string>;
  write?: (
    path: string,
    content: string,
    options: { flag: "wx" },
  ) => Promise<void>;
  emit?: boolean;
}): Promise<T>;
export function loadGenerationModelUsage(input: {
  gh: GhRunner;
  download: (args: string[]) => Promise<Uint8Array>;
  repository: string;
  publisherActorId: number;
  operation: import("./operation.mjs").AutomationOperation;
  runId: number;
}): Promise<{
  schema_version: 1;
  operationKey: string;
  producer: { runId: number; workflow: string; sourceSha: string };
  modelUsage: import("./model-budget.mjs").ModelUsageEvidence[];
} | null>;
export function createProducerBudgetLoader(input?: {
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
  event?: { inputs?: Record<string, string> };
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  persistEvidence?: (
    path: string,
    content: string,
    options: { flag: "wx" | "w" },
  ) => void;
}): {
  load: () => Promise<ModelBudgetGuard>;
  usage: () => import("./model-budget.mjs").ModelUsageEvidence[];
  evidenceSaved: () => boolean;
};
export function dispatchReservedModelPreparation(input: {
  gh: GhRunner;
  repository: string;
  publisherActorId: number;
  operationKey: string;
  workflow: string;
  sourceSha: string;
  ticketIds: string[];
  projectId?: string;
  issueNumber?: number;
  checkpointRunIds?: number[];
  requestRunId?: number;
  forceRegeneration?: boolean;
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
  requestRunId?: number;
}): Promise<ModelBudgetGuard>;
export function dispatchUnbudgetedPreparation(
  input: Omit<
    Parameters<typeof dispatchReservedModelPreparation>[0],
    "ticketIds"
  >,
): Promise<{ runId: number; workflow: string }>;
