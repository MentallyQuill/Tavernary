import type { AutomationReceipt } from "./receipts.mjs";
import type {
  ProjectInventoryIssue,
  ProjectInventoryPull,
  ProjectInventoryRun,
} from "./project-operations.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export interface GithubAutomationInventory {
  issues: ProjectInventoryIssue[];
  pulls: ProjectInventoryPull[];
  runs: ProjectInventoryRun[];
  mainHeadSha: string;
}
export function githubFailureStatus(error: unknown): number;
export function loadAutomationWorkerRuns(input: {
  gh: GhRunner;
  repository: string;
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
  nowMs: number;
}): Promise<GithubAutomationInventory>;
export function persistGithubAutomationReceipt(input: {
  gh: GhRunner;
  repository: string;
  receipt: AutomationReceipt;
}): Promise<void>;
