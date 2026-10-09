import type { AutomationOperation } from "./operation.mjs";
import type { AutomationInventoryState } from "./inventory.mjs";
export interface HealthFinding {
  key: string;
  code: string;
  subject: string;
  status: "active" | "recovered";
  reason: string;
  count: number;
  revision?: string;
}
export const HEALTH_TITLES: Readonly<Record<string, string>>;
export function validateHealthFinding(value: unknown): HealthFinding;
export interface HealthInput {
  nowMs: number;
  runtime?: { reason: string };
  operations?: Array<
    AutomationOperation & { automatic: boolean; progressAt?: string }
  >;
  refreshState?: Array<{
    provider: string;
    required: boolean;
    refreshedAt?: string;
    healthy?: boolean;
  }>;
  importState?: Array<{ key: string; dueAt: string; completed: boolean }>;
  deploymentState?: {
    latestRevision: string;
    activeRevision?: string;
    pendingSince: string;
    ordinary: boolean;
  };
  circuits?: Array<{ subject: string; reason: string; recovered: boolean }>;
  budget?: { exhausted: boolean };
  dependencies?: Array<{
    number: number;
    failed: boolean;
    recovered: boolean;
    headSha: string;
  }>;
}
export function assessAutomationHealth(input: HealthInput): HealthFinding[];
export function assessInventoryHealth(
  state: AutomationInventoryState,
): HealthFinding[];
