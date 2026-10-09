export const AUTOMATION_FAILURE_REASON_CODES: readonly string[];
export const AUTOMATION_FAILURE_REASON_KINDS: Readonly<
  Record<string, AutomationFailureKind>
>;

export type AutomationFailureKind =
  "transient" | "configuration" | "permanent" | "superseded" | "unknown";

export interface AutomationFailure {
  kind: AutomationFailureKind;
  reasonCode: string;
}

export interface AutomationFailureInput {
  conclusion?: string | null;
  diagnosticCode?: string | null;
  httpStatus?: number;
  validationErrors?: readonly unknown[];
  authorizationLost?: boolean;
  superseded?: boolean;
}

export function classifyAutomationFailure(
  input?: AutomationFailureInput,
): AutomationFailure;
