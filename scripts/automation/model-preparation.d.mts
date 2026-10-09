import type { ModelBudgetState, ModelBudgetRequest } from "./model-budget.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
export function assessModelProviderCircuit(input: {
  operations: AutomationOperation[];
  receipts: AutomationReceipt[];
  budget: ModelBudgetState | null;
  nowMs: number;
  models?: string[];
  operationKey?: string;
  requestId?: string;
}): { open: boolean; blocked: boolean; reason: string | null };
export interface BudgetWriterState {
  mainSha: string;
  budget: ModelBudgetState;
  eligible: boolean;
  waitReason?: string;
}
export function reserveModelPreparation(input: {
  operationKey: string;
  workflow: string;
  requestId: string;
  requests: Array<Omit<ModelBudgetRequest, "operationKey" | "requestId">>;
  load: () => Promise<BudgetWriterState>;
  persist: (state: BudgetWriterState) => Promise<{ sha: string }>;
  dispatch: (input: {
    ticketIds: string[];
    sourceSha: string;
  }) => Promise<{ runId: number; workflow: string }>;
  nowMs: number;
  monthlyUsd?: number;
}): Promise<
  | { status: "superseded" }
  | { status: "waiting"; reason: string }
  | { status: "dispatched"; runId: number; ticketIds: string[] }
>;
