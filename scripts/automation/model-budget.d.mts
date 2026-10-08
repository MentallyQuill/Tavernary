export interface ModelPrice {
  model: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}
export interface ModelUsage {
  requests: number;
  tokens: number;
}
export interface ModelUsageEvidence {
  ticketId: string;
  usage: ModelUsage;
}
export const MODEL_USAGE_SCHEMA: Record<string, unknown>;
export function validateModelUsageEvidence(
  value: unknown,
): ModelUsageEvidence[];
export function settlePreparedModelUsage(
  state: ModelBudgetState,
  settlements: Array<{
    operationKey: string;
    producer: { runId: number; workflow: string };
    modelUsage: ModelUsageEvidence[];
  }>,
): ModelBudgetState;
export interface ModelBudgetTicket {
  id: string;
  operationKey: string;
  requestId: string;
  day: string;
  model: string;
  requestCount: number;
  requestedTokens: number;
  price: ModelPrice | null;
  reservedMicrousd: number;
  createdAt: string;
  expiresAt: string;
  producer: { runId: number; workflow: string } | null;
  settled: boolean;
  usage: ModelUsage | null;
}
export interface ModelBudgetState {
  schema_version: 1;
  updatedAt: string;
  days: Array<{ day: string; requests: number; tokens: number }>;
  months: Array<{
    month: string;
    reservedMicrousd: number;
    unpricedTokens: number;
  }>;
  tickets: ModelBudgetTicket[];
}
export interface ModelBudgetRequest {
  operationKey: string;
  requestId?: string;
  requestCount: number;
  requestedTokens: number;
  model: string;
  price?: ModelPrice;
}
export interface ModelBudgetLimits {
  nowMs: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
  monthlyUsd?: number;
}
export type BudgetDecision =
  | { allowed: true; state: ModelBudgetState; ticket: ModelBudgetTicket }
  | {
      allowed: false;
      state: ModelBudgetState;
      reason:
        | "clock-skew"
        | "ticket-expired"
        | "daily-limit"
        | "price-unavailable"
        | "monthly-limit";
    };
export function createModelBudgetState(nowMs: number): ModelBudgetState;
export function validateModelBudgetState(value: unknown): ModelBudgetState;
export function reserveModelBudget(
  state: ModelBudgetState,
  request: ModelBudgetRequest,
  options: ModelBudgetLimits,
): BudgetDecision;
export function settleModelBudget(
  state: ModelBudgetState,
  ticket: ModelBudgetTicket,
  usage: ModelUsage | null,
): ModelBudgetState;
export function bindModelBudgetTicket(
  state: ModelBudgetState,
  id: string,
  producer: NonNullable<ModelBudgetTicket["producer"]>,
): ModelBudgetState;
export function estimateRequestedTokens(input: {
  body: Record<string, unknown>;
  maxOutputTokens: number;
}): number;
export interface ModelBudgetGuard {
  beforeRequest(input: {
    model: string;
    body: Record<string, unknown>;
    maxOutputTokens: number;
  }): string | void;
  completeRequest?: (receipt: string) => void;
  usage?: () => ModelUsageEvidence[];
}
export interface VerifiedModelBudgetGuard extends ModelBudgetGuard {
  beforeRequest(input: {
    model: string;
    body: Record<string, unknown>;
    maxOutputTokens: number;
  }): string;
  completeRequest(receipt: string): void;
  usage(): ModelUsageEvidence[];
}
export function createModelBudgetGuard(input: {
  state: ModelBudgetState;
  ticketIds: string[];
  operationKey: string;
  runId: number;
  workflow: string;
  runAttempt: number;
  nowMs?: () => number;
}): VerifiedModelBudgetGuard;
