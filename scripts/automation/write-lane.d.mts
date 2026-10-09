import type { AutomationOperation } from "./operation.mjs";
import type {
  PreparedResult,
  PreparedCurrentState,
  PreparedFile,
  TrustedPreparationRun,
} from "./prepared-result.mjs";
import type { ProjectPublicationPlan } from "../publication/project-publication-planner.mjs";
export interface PublicationPlanningInput {
  operations: AutomationOperation[];
  candidates: Array<{
    result: PreparedResult;
    run: TrustedPreparationRun;
    currentState: PreparedCurrentState;
  }>;
  currentMainSha: string;
  expectedPublisherId: number;
}
export type PublicationAction =
  | {
      action: "commit";
      operationKeys: string[];
      expectedMainSha: string;
      files: PreparedFile[];
      modelSettlements?: Array<{
        operationKey: string;
        producer: PreparedResult["producer"];
        modelUsage: NonNullable<PreparedResult["modelUsage"]>;
      }>;
    }
  | (Extract<ProjectPublicationPlan, { action: "merge" }> & {
      operationKeys: string[];
      expectedMainSha: string;
    });
export interface PublicationPlan {
  actions: PublicationAction[];
  rejected: Array<{ key: string; reasonCode: string }>;
  regenerate: Array<{ key: string; reasonCode: string }>;
  waiting: Array<{ key: string; reasonCode: string }>;
  satisfied: string[];
}
export function planCanonicalPublication(
  input: PublicationPlanningInput,
): PublicationPlan;
