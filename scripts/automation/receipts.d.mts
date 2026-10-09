import type { AutomationOperation } from "./operation.mjs";
export interface AutomationReceipt {
  schema_version: 1;
  operation: AutomationOperation;
  updatedAt: string;
  completedAt: string | null;
}
export function validateAutomationReceipt(value: unknown): AutomationReceipt;
