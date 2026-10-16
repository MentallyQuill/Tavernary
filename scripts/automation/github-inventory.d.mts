import type { AutomationReceipt } from "./receipts.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type {
  ProjectInventoryIssue,
  ProjectInventoryPull,
  ProjectInventoryRun,
} from "./project-operations.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export class GithubInventoryUnavailableError extends Error {
  readonly code: "github-inventory-unavailable";
  constructor();
}
export interface GithubAutomationInventory {
  issues: ProjectInventoryIssue[];
  pulls: ProjectInventoryPull[];
  runs: ProjectInventoryRun[];
  mainHeadSha: string;
  finalizationOperationKey?: string;
}
export function githubFailureStatus(error: unknown): number;
export function retainedAutomationRunIds(
  receipts: AutomationReceipt[],
): number[];
export function loadGithubRunArtifacts(input: {
  gh: GhRunner;
  repository: string;
  runId: number;
}): Promise<Record<string, unknown>[]>;
export function assertCanonicalWriterContext(
  env: Record<string, string | undefined>,
  repository: string,
  event?: unknown,
): void;
export function loadAutomationWorkerRuns(input: {
  gh: GhRunner;
  repository: string;
  nowMs: number;
  createdAfterMs?: number;
}): Promise<ProjectInventoryRun[]>;
export interface PreparedDiagnosticRunsInput {
  gh: GhRunner;
  repository: string;
  publisherActorId: number;
  nowMs: number;
  operation: AutomationOperation;
  knownRuns?: ProjectInventoryRun[];
  evidenceRun: ProjectInventoryRun;
  history?: GithubAutomationInventory;
  retainedRunIds?: number[];
}
export function loadPreparedDiagnosticRuns(
  input: PreparedDiagnosticRunsInput,
): Promise<Pick<GithubAutomationInventory, "runs" | "mainHeadSha"> | null>;
export function loadSiteWriterRecoveryRuns(input: {
  gh: GhRunner;
  repository: string;
  nowMs: number;
  workflow: "restore-site.yml" | "automation-writer.yml";
}): Promise<ProjectInventoryRun[]>;
export function loadGenerationOwnerRequestRuns(input: {
  gh: GhRunner;
  repository: string;
  issues: ProjectInventoryIssue[];
  nowMs: number;
}): Promise<ProjectInventoryRun[]>;
export function assertTrustedAutomationContext(
  env: Record<string, string | undefined>,
  repository: string,
  event?: unknown,
): void;
export function loadGithubAutomationInventory(input: {
  gh: GhRunner;
  repository: string;
  receipts: AutomationReceipt[];
  referencedOperations?: AutomationOperation[];
  nowMs: number;
  finalizationOperation?: AutomationOperation;
  publisherActorId?: number;
  downloadDiagnostic?: (args: string[]) => Promise<Uint8Array>;
}): Promise<GithubAutomationInventory>;
export function persistGithubAutomationReceipt(input: {
  gh: GhRunner;
  repository: string;
  receipt: AutomationReceipt;
}): Promise<void>;
