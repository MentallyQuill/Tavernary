import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { ProjectValidationRun } from "../submissions/project-validation-reconciliation.mjs";
import type { SourceRecord } from "../../src/features/catalog/source-record.mjs";
import type { OwnerVocabularies } from "../../src/features/help/project-owner-manifest.mjs";

export interface ProjectInventoryIssue {
  number: number;
  state: string;
  body?: string | null;
  title?: string;
  pull_request?: unknown;
  user?: { id: number; login: string; type: "User" | "Bot" };
  labels: Array<string | { name: string }>;
  created_at?: string;
  updated_at?: string;
}
export interface ProjectInventoryPull {
  number: number;
  state: string;
  body: string;
  user: { id: number; type: string };
  head: { sha: string; ref: string; repo: { full_name: string } };
  base: { ref: string; repo: { full_name: string } };
  merged_at?: string | null;
  merge_commit_sha?: string | null;
  updated_at?: string;
}
export interface ProjectInventoryRun extends ProjectValidationRun {
  path?: string;
  name?: string;
  event?: string;
  display_title?: string;
  head_branch?: string;
  actor?: { id: number; type: string };
}
export interface ProjectInventoryInput {
  issues: ProjectInventoryIssue[];
  pulls: ProjectInventoryPull[];
  runs: ProjectInventoryRun[];
  receipts: AutomationReceipt[];
  catalog: {
    projects: Array<{ id: string; source_id: string; listing_status?: string }>;
    sources: SourceRecord[];
    confirmedRevisions?: string[];
    requestedRevisions?: string[];
    vocabularies?: Omit<OwnerVocabularies, "source">;
  };
  publisherActorId: number;
  nowMs: number;
  repository?: string;
  defaultBranch?: string;
}
export function discoverProjectOperations(
  input: ProjectInventoryInput,
): AutomationOperation[];
