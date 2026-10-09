import type { HealthFinding } from "./health.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export interface IncidentIssue {
  number: number;
  title?: string;
  body?: string | null;
  state?: string;
  state_reason?: string | null;
  user?: { id?: number; type?: string };
  closed_by?: { id?: number; type?: string } | null;
  pull_request?: unknown;
}
export interface IncidentInput {
  findings: HealthFinding[];
  existingIssues: IncidentIssue[];
  publisherActorId: number;
}
export interface IncidentMutation {
  action: "create" | "close" | "reopen" | "update";
  key: string;
  number?: number;
  title: string;
  body: string;
}
export function planIncidentUpdates(input: IncidentInput): IncidentMutation[];
export function reconcileIncidentUpdates(input: {
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
  load: () => Promise<IncidentInput>;
  availableSlots?: number;
}): Promise<{ status: string; reason?: string; number?: number }>;
