import type { VerifiedBundle } from "./site-bundle.mjs";
export type RollbackDecision =
  | { action: "reject"; reason: string; ownerDecisionRequired: true }
  | {
      action: "deploy";
      mode: "rollback";
      sourceSha: string;
      buildId: string;
      archiveDigest: string;
      reason: string;
    };
export function planRollback(input: {
  target: VerifiedBundle;
  currentCatalogDigest: string;
  currentTargetsDigest: string;
  ownerTombstones: string[];
  authorizedReason: string;
}): RollbackDecision;
