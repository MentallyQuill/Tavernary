import type { AutomationFailure } from "./failure.mjs";

export type AutomationKind =
  | "project"
  | "owner-request"
  | "kit"
  | "withdrawal"
  | "refresh"
  | "report-import"
  | "metadata"
  | "advisory"
  | "deployment"
  | "dependency"
  | "runtime"
  | "restore"
  | "retention"
  | "health";
export type AutomationStage =
  | "discovered"
  | "admitted"
  | "generated"
  | "validated"
  | "published"
  | "deployment-requested"
  | "deployment-confirmed"
  | "finalized";
export interface AutomationIdentity {
  kind: AutomationKind;
  subject: string;
  inputDigest: string;
  policyVersion: string;
}
export interface AutomationOperation {
  key: string;
  identity: AutomationIdentity;
  stage: AutomationStage;
  createdAt: string;
  nextEligibleAt: string | null;
  expectedSha: string | null;
  workerRunId: number | null;
  retry: {
    failure: AutomationFailure;
    transientAttempts: number;
    immediateAttempts: number;
  } | null;
}
export function operationKey(identity: AutomationIdentity): string;
export const AUTOMATION_KINDS: readonly AutomationKind[];
export const AUTOMATION_STAGES: readonly AutomationStage[];
export const AUTOMATION_OPERATION_SCHEMA: Record<string, unknown>;
export function automationSchemaValidator(
  schema: object,
): import("ajv").ValidateFunction;
export function validateAutomationOperation(
  value: unknown,
): AutomationOperation;
export function selectDueOperations(
  operations: AutomationOperation[],
  options: { nowMs: number; limit?: number },
): AutomationOperation[];
