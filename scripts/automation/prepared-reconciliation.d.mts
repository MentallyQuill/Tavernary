import type { AutomationInventoryState } from "./inventory.mjs";
import type { PublicationResult } from "./publish.mjs";
import type { PreparedWake } from "./prepared-wake.mjs";
import type { AutomationFailure } from "./failure.mjs";
import type { PreparedDiagnosticEvidence } from "./prepared-github.mjs";
export function reconcilePreparedOperations(input: {
  state: AutomationInventoryState;
  hasResult: (wake: PreparedWake) => Promise<boolean>;
  publish: (wakes: PreparedWake[]) => Promise<PublicationResult>;
  limit?: number;
  priorityKeys?: readonly string[];
  readDiagnostic?: (wake: PreparedWake) => Promise<AutomationFailure>;
  readDiagnosticEvidence?: (
    wake: PreparedWake,
  ) => Promise<PreparedDiagnosticEvidence>;
  isDiagnosticObsolete?: (input: {
    wake: PreparedWake;
    evidence: PreparedDiagnosticEvidence;
  }) => Promise<boolean>;
  onFailure?: (input: {
    operationKey: string;
    error: unknown;
  }) => Promise<void>;
}): Promise<{
  published: number;
  recovered: number;
  failures: number;
  consumedKeys: string[];
  reloadRequired?: boolean;
}>;
