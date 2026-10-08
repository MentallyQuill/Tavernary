import type { AutomationOperation } from "./operation.mjs";
import type { ActiveDeployment } from "./deployment-state.mjs";
import type { InventoryWorkerState } from "./inventory-worker.mjs";
export interface DeploymentInventoryEvidence {
  sourceSha: string;
  status: "requested" | "confirmed" | "failed";
  /** Verified digest of the retained bundle built by the trusted workflow. */
  bundleDigest?: string;
  confirmation?: {
    sourceSha: string;
    catalogDigest: string;
    targetDigest: string;
    buildDigest: string;
    essentialSmokePassed: boolean;
  };
}
export interface DeploymentInventoryInput extends InventoryWorkerState {
  mainHeadSha: string;
  /** Latest ancestor with public effects, derived from fresh trusted main Git history. */
  latestPublishableSha?: string;
  /** Commits and digests come from the trusted main checkout, not the hosted manifest. */
  mainCommits: Array<{
    sha: string;
    committedAt: string;
    catalogDigest: string;
    targetDigest: string;
    publishable: boolean;
  }>;
  deployments: DeploymentInventoryEvidence[];
  activeDeployment?: ActiveDeployment | null;
}
export function discoverDeploymentOperations(
  input: DeploymentInventoryInput,
): AutomationOperation[];
export function isConfirmedDeployment(
  deployment: unknown,
  commit: { sha: string; catalogDigest: string; targetDigest: string },
): boolean;
