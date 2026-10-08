import type { TrustedPreparationRun } from "./prepared-result.mjs";
import type { AutomationOperation } from "./operation.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export interface PreparedWake {
  operationKey: string;
  runId: number;
  diagnostic?: true;
}
export function planPreparedWake(input: {
  diagnostic?: boolean;
  run: TrustedPreparationRun & { display_title: string };
  repository: string;
  publisherActorId: number;
}): PreparedWake | null;
export function selectPreparedWakes(input: {
  runs: Array<TrustedPreparationRun & { display_title: string }>;
  operations: AutomationOperation[];
  repository: string;
  publisherActorId: number;
  limit?: number;
  nowMs?: number;
  includeDiagnostics?: boolean;
}): PreparedWake[];
export function runPreparedWakeCli(options?: {
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
  runId?: number;
  write?: (value: string) => void;
}): Promise<number>;
