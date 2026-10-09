import type { AutomationFailure } from "./failure.mjs";

export interface RetryDecision {
  action: "retry" | "probe" | "stop" | "recompute";
  nextEligibleAt: string | null;
  reasonCode: string;
  incident?: boolean;
}

export interface AutomationRetryInput {
  failure: AutomationFailure;
  transientAttempts: number;
  immediateAttempts: number;
  nowMs: number;
  retryAfterMs?: unknown;
  jitterSeed: string;
}

export function planAutomationRetry(input: AutomationRetryInput): RetryDecision;
