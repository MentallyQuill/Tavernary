export interface DeploymentPlanInput {
  requestedSha: string;
  currentMainSha: string;
  /** Exact source of an authoritative confirmed deployment, never an unverified hosted response. */
  deployedSha: string | null;
  validatedSha: string;
  latestPublishableSha?: string;
  isAncestor: (ancestor: string, descendant: string) => boolean | null;
  mode: "ordinary" | "rollback";
  authorizedRollbackReason?: string;
}
export type DeploymentDecision =
  | { action: "deploy"; sourceSha: string; mode: "ordinary" | "rollback" }
  | { action: "coalesced"; sourceSha: string }
  | { action: "superseded"; targetSha: string }
  | { action: "reject"; reason: string };
export function planDeployment(input: DeploymentPlanInput): DeploymentDecision;
export function readPreviousManifest<T>(
  read: () => Promise<T>,
): Promise<{ status: "available"; value: T } | { status: "unavailable" }>;
