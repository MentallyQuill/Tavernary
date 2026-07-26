export type EnrichmentRolloutAction =
  | "complete"
  | "resume-full"
  | "start-canary"
  | "continue-canary"
  | "deploy-canary"
  | "start-full";

export function planEnrichmentRollout(input: {
  model: string;
  selectionMode?: "pending" | "all-automatic";
  eligibleCount: number;
  fullReport?: Record<string, unknown> | null;
  canaryReport?: Record<string, unknown> | null;
}): { action: EnrichmentRolloutAction };

export function createEnrichmentRolloutPlan(input: {
  model: string;
  selectionMode?: "pending" | "all-automatic";
  records: Array<Record<string, unknown>>;
  fullReport?: Record<string, unknown> | null;
  canaryReport?: Record<string, unknown> | null;
}): {
  action: EnrichmentRolloutAction;
  eligible_count: number;
  manual_exclusion_count: number;
};

export function runPlannerCli(options?: {
  model?: string;
  selectionMode?: "pending" | "all-automatic";
  records?: Array<Record<string, unknown>>;
  fullReport?: Record<string, unknown> | null;
  canaryReport?: Record<string, unknown> | null;
  reportPath?: string;
  canaryReportPath?: string;
}): Promise<{
  action: EnrichmentRolloutAction;
  eligible_count: number;
  manual_exclusion_count: number;
}>;
