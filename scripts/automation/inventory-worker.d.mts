import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { ProjectInventoryRun } from "./project-operations.mjs";
export interface InventoryWorkerState {
  receipts: AutomationReceipt[];
  nowMs: number;
  runs?: ProjectInventoryRun[];
  publisherActorId?: number;
  defaultBranch?: string;
}
export function trustedOperationWorkerRuns(
  input: InventoryWorkerState,
  operation: AutomationOperation,
): ProjectInventoryRun[];
export function isInventoryWorkerActive(run: ProjectInventoryRun): boolean;
export function matchingOperationReceipt(
  input: InventoryWorkerState,
  operation: AutomationOperation,
): AutomationReceipt | undefined;
export function receiptBindsWorker(
  run: ProjectInventoryRun,
  receipt: AutomationReceipt | undefined,
): boolean | undefined;
/** Runs must already be filtered to the trusted workflow, actor, subject and default branch. */
export function recoverInventoryWorker(
  operation: AutomationOperation,
  input: InventoryWorkerState,
  runs: ProjectInventoryRun[],
): void;
