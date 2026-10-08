import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { PublicationAction, PublicationPlan } from "./write-lane.mjs";
export interface CanonicalPublicationState {
  mainSha: string;
  operations: AutomationOperation[];
  receipts?: AutomationReceipt[];
  /** Produced by current canonical record/PR verification, never receipts. */ canonicalRevisions: Record<
    string,
    string
  >;
}
export type PublicationValidation =
  | { action: "ready"; publication: PublicationAction }
  | { action: "regenerate" | "reject" | "wait"; reasonCode: string };
export interface PublicationInput {
  plan: PublicationPlan;
  nowMs: number;
  readState: () => Promise<CanonicalPublicationState>;
  validate: (
    action: PublicationAction,
    state: CanonicalPublicationState,
  ) => Promise<PublicationValidation>;
  commit: (
    action: Extract<PublicationAction, { action: "commit" }>,
    state: CanonicalPublicationState,
  ) => Promise<{ sha: string }>;
  merge: (
    action: Extract<PublicationAction, { action: "merge" }>,
    state: CanonicalPublicationState,
  ) => Promise<{ sha: string }>;
  persist: (receipt: AutomationReceipt) => Promise<void>;
}
export interface PublicationResult {
  published: number;
  recovered: number;
  waiting: number;
  regenerated: number;
  rejected: number;
}
export function publishCanonicalBatch(
  input: PublicationInput,
): Promise<PublicationResult>;
