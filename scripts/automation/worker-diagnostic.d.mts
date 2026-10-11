import type { AutomationFailure } from "./failure.mjs";
import type { ProjectInventoryRun } from "./project-operations.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export interface WorkerDiagnostic {
  schema_version: 1;
  operation_key: string;
  failure: AutomationFailure;
  runId: number;
  runAttempt: number;
  sourceSha: string;
}
export interface WorkerDiagnosticRun extends ProjectInventoryRun {
  repository?: { id?: number; full_name?: string };
  head_repository?: { id?: number; full_name: string };
  run_started_at?: string;
  automationDiagnostic?: WorkerDiagnostic;
}
export interface WorkerDiagnosticContext {
  run: WorkerDiagnosticRun;
  repository: string;
  operationKey: string;
  publisherActorId: number;
}
export function trustedWorkerDiagnosticRun(
  input: WorkerDiagnosticContext,
): boolean;
export function validatedWorkerDiagnosticFailure(input: {
  run: WorkerDiagnosticRun;
  repository?: string;
  operationKey: string;
  publisherActorId?: number;
}): AutomationFailure | null;
export function loadWorkerGithubDiagnostic(
  input: WorkerDiagnosticContext & {
    gh: GhRunner;
    download: (args: string[]) => Promise<Uint8Array>;
  },
): Promise<WorkerDiagnostic | null>;
