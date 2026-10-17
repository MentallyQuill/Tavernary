import type { AutomationInventoryState } from "../automation/inventory.mjs";
import type { AutomationReceipt } from "../automation/receipts.mjs";
import type { GhRunner } from "./kit-submission-reconciliation.mjs";
import type { commitCanonicalData } from "../automation/canonical-data.mjs";
export interface SubmissionTarget {
  issueNumber: number;
  operationKey?: string;
}
export function finalizeSubmissionTarget(
  input: SubmissionTarget & {
    load: (target: SubmissionTarget) => Promise<AutomationInventoryState>;
    gh?: GhRunner;
    persist?: (receipt: AutomationReceipt) => Promise<void>;
    isAncestor?: (ancestor: string, descendant: string) => boolean | null;
    commit?: (
      input: Omit<Parameters<typeof commitCanonicalData>[0], "gh">,
    ) => Promise<{ sha: string }>;
  },
): Promise<{ status: string }>;
export function runSubmissionFinalizationCli(input?: {
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
  event?: { inputs?: Record<string, unknown>; workflow_run?: unknown };
  load?: (target: SubmissionTarget) => Promise<AutomationInventoryState>;
  write?: (output: string) => void;
  confirmSite?: (input: {
    env: Record<string, string | undefined>;
    gh: GhRunner;
    runId: number;
  }) => Promise<{ status: string }>;
}): Promise<number>;
