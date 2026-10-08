import type { ModelBudgetState, ModelBudgetRequest } from "./model-budget.mjs";
export interface BudgetWriterState {
  mainSha: string;
  budget: ModelBudgetState;
  eligible: boolean;
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
