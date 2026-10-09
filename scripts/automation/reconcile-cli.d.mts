import type { ReconciliationInput } from "./reconcile.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export function runReconcileAutomationCli(
  options?: Partial<ReconciliationInput> & {
    args?: string[];
    env?: Record<string, string | undefined>;
    event?: unknown;
    gh?: GhRunner;
    root?: string;
    write?: (value: string) => void;
  },
): Promise<number>;
