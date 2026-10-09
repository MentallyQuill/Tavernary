import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { ProjectInventoryRun } from "./project-operations.mjs";
import type { TrustedEditorRegistry } from "../maintenance/trusted-editor-authority.mjs";
import type {
  GitHubKitIssue,
  ReconciliationProject,
  ReconciliationSource,
  ReconciliationSnapshot,
  ReconciliationKit,
  ReconciliationBlockedUsers,
} from "../submissions/kit-submission-reconciliation.mjs";
export interface KitInventoryInput {
  issues: Array<
    GitHubKitIssue & {
      user: GitHubKitIssue["user"] & { type?: string };
      created_at?: string;
      author_association?: string;
    }
  >;
  kits: ReconciliationKit[];
  projects: ReconciliationProject[];
  sourcesById: Record<string, ReconciliationSource>;
  snapshotsBySourceId: Record<string, ReconciliationSnapshot>;
  blockedUsers: ReconciliationBlockedUsers;
  trustedEditors?: TrustedEditorRegistry;
  runs: ProjectInventoryRun[];
  receipts: AutomationReceipt[];
  nowMs: number;
  publisherActorId: number;
  canonicalRevision?: string;
  canonicalRevisions?: Record<string, string>;
  confirmedRevisions?: string[];
  requestedRevisions?: string[];
  defaultBranch?: string;
}
export function discoverKitOperations(
  input: KitInventoryInput,
): AutomationOperation[];
