import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { GithubAutomationInventory } from "./github-inventory.mjs";
import type { TavernKeeperReportIndexV5 } from "../security/tavernkeeper-reports.mjs";
export interface AutomationInventoryState {
  root: string;
  repository: string;
  publisherActorId: number;
  nowMs: number;
  inventoryNowMs?: number;
  executingWriterRunId?: number;
  remote: GithubAutomationInventory;
  local: Record<string, unknown>;
  receipts: AutomationReceipt[];
  operations: AutomationOperation[];
}
export function loadAutomationInventory(input: {
  root: string;
  gh: GhRunner;
  repository: string;
  publisherActorId: number;
  nowMs: number;
  reportIndex?: TavernKeeperReportIndexV5;
  finalizationOperationKey?: string;
  executingWriterRunId?: number;
}): Promise<AutomationInventoryState>;
export function discoverAutomationState(
  state: AutomationInventoryState,
): AutomationOperation[];
export function revalidateAutomationOperation(input: {
  state: AutomationInventoryState;
  operation: AutomationOperation;
  gh: GhRunner;
  repository: string;
  nowMs: number;
  env?: Record<string, string | undefined>;
}): Promise<AutomationOperation | null>;
export function dispatchAutomationOperation(input: {
  operation: AutomationOperation;
  gh: GhRunner;
  repository: string;
  env: Record<string, string | undefined>;
}): Promise<{ workerRunId: number | null }>;
