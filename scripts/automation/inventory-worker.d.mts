import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { ProjectInventoryRun } from "./project-operations.mjs";
import type { WorkerDiagnosticRun } from "./worker-diagnostic.mjs";
export interface InventoryWorkerState {
  receipts: AutomationReceipt[];
  nowMs: number;
  runs?: WorkerDiagnosticRun[];
  publisherActorId?: number;
  defaultBranch?: string;
  repository?: string;
  /** Set only by the authenticated canonical writer executing this run. */
  executingWriterRunId?: number;
}
export function trustedOperationWorkerRuns(
  input: InventoryWorkerState,
  operation: AutomationOperation,
): WorkerDiagnosticRun[];
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
  runs: WorkerDiagnosticRun[],
): void;

export function trustedWriterHandoff(
  run: ProjectInventoryRun,
  input: Pick<
    InventoryWorkerState,
    "repository" | "publisherActorId" | "defaultBranch"
  >,
  operation: AutomationOperation,
): boolean;
