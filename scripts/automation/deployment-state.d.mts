import type { ConfirmedDeployment } from "./confirm-deployment.mjs";
export interface ActiveDeployment {
  schema_version: 1;
  mode: "ordinary" | "rollback";
  deployment: ConfirmedDeployment & { workflowRunId: number };
  observedAt: string;
  confirmingRunId: number;
  rollbackBaselineSha: string | null;
  rollbackReason: string | null;
  ownerActorId: number | null;
}
export function validateActiveDeployment(
  active: unknown,
  input?: { nowMs?: number },
): ActiveDeployment;
export function createActiveDeployment(input: {
  deployment: ConfirmedDeployment & { workflowRunId: number };
  confirmingRunId: number;
  nowMs: number;
  mode?: "ordinary" | "rollback";
  rollbackBaselineSha?: string | null;
  rollbackReason?: string | null;
  ownerActorId?: number | null;
}): ActiveDeployment;
export function activeRollbackCoversMain(input: {
  active: unknown;
  latestPublishableSha: string;
  catalogDigest: string;
  targetDigest: string;
  nowMs?: number;
}): boolean;
