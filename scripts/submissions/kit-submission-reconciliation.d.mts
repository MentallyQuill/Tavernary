export type KitHistoryDisposition =
  | "published-create"
  | "applied-edit"
  | "superseded"
  | "unpublished-valid"
  | "invalid";

export interface GitHubKitIssue {
  number: number;
  state: "open" | "closed";
  state_reason: string | null;
  labels: Array<string | { name: string }>;
  body: string;
  user: { id: number; login: string };
  pull_request?: unknown;
}

export interface ReconciliationProject {
  id: string;
  kind: string;
  visibility?: string;
}

export interface ReconciliationKit {
  id: string;
  status: string;
  title: string;
  description: string;
  author: { github_user_id: number; login: string };
  source_issue_number: number;
  project_ids: string[];
  [key: string]: unknown;
}

export interface ReconciliationBlockedUsers {
  blocked?: Array<{ github_user_id: number }>;
}

export interface KitReconciliation {
  disposition: KitHistoryDisposition;
  desiredOwnedLabels: string[];
  desiredState: "open" | "closed";
  desiredStateReason: "completed" | null;
  dispatch: boolean;
}

export interface KitReconciliationLedgerEntry extends KitReconciliation {
  issueNumber: number;
  labels: string[];
}

export interface KitReconciliationInput {
  issue: GitHubKitIssue;
  projects: ReconciliationProject[];
  kits: ReconciliationKit[];
  blockedUsers: ReconciliationBlockedUsers;
}

export type GhRunner = (args: string[], stdin?: string) => Promise<string>;

export function classifyKitSubmissionHistory(
  input: KitReconciliationInput,
): KitReconciliation;

export function reconcileOwnedKitLabels(input: {
  currentLabels: string[];
  desiredOwnedLabels: string[];
}): string[];

export function buildKitReconciliationLedger(input: {
  issues: GitHubKitIssue[];
  projects: ReconciliationProject[];
  kits: ReconciliationKit[];
  blockedUsers: ReconciliationBlockedUsers;
}): KitReconciliationLedgerEntry[];

export function runKitReconciliation(input: {
  repository: string;
  apply: boolean;
  gh: GhRunner;
  projects: ReconciliationProject[];
  kits: ReconciliationKit[];
  blockedUsers: ReconciliationBlockedUsers;
}): Promise<KitReconciliationLedgerEntry[]>;

export function parseReconciliationArgs(args: string[]): {
  repository: string;
  apply: boolean;
};

export function executeGh(args: string[], stdin?: string): Promise<string>;
