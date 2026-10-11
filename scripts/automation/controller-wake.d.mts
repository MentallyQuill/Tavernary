import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export function wakeAutomationWriter(input: {
  gh?: GhRunner;
  repository: string;
}): Promise<{ status: "coalesced" | "dispatched" }>;
