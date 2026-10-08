import type { AutomationOperation } from "./operation.mjs";
import type {
  PreparedCurrentState,
  PreparedResult,
} from "./prepared-result.mjs";
export interface CapturedPreparation {
  schema_version: 1;
  operation: AutomationOperation;
  repository: string;
  source: PreparedResult["source"];
  authorId: number;
  inputDigest: string;
  policyVersion: string;
  baseSha: string;
  producer: PreparedResult["producer"];
  publisherActorId: number;
  allowedPaths: string[];
  fileDigests: Record<string, string>;
}
export function capturePreparedOperation(input: {
  operation: AutomationOperation;
  currentState: PreparedCurrentState;
  producer: PreparedResult["producer"];
  publisherActorId: number;
}): CapturedPreparation;
export function emitPreparedOperation(input: {
  captured: CapturedPreparation;
  currentState: PreparedCurrentState;
  read: (path: string) => Promise<{ type: string; content: string } | null>;
}): Promise<PreparedResult | null>;
