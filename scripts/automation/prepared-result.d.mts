import type { AutomationKind, AutomationOperation } from "./operation.mjs";
export interface PreparedFile {
  path: string;
  type: "file";
  content: string;
  sha256: string;
  bytes: number;
  baseDigest: string | null;
}
export interface PreparedResult {
  schema_version: 1;
  operationKey: string;
  kind: AutomationKind;
  inputDigest: string;
  policyVersion: string;
  source: { id: string; identity: string };
  authorId: number;
  repository: string;
  producer: { workflow: string; runId: number; sourceSha: string };
  baseSha: string;
  files: PreparedFile[];
  modelUsage?: import("./model-budget.mjs").ModelUsageEvidence[];
}
export interface TrustedPreparationRun {
  id: number;
  path: string;
  actor: { id: number; type: string };
  event: string;
  head_branch: string;
  head_sha: string;
  head_repository: { full_name: string };
  status: string;
  conclusion: string | null;
}
export interface PreparedCurrentState {
  projectId?: string;
  repository: string;
  mainSha: string;
  source: PreparedResult["source"];
  authorId: number;
  inputDigest: string;
  policyVersion: string;
  authorityValid: boolean;
  allowedPaths: string[];
  fileDigests: Record<string, string>;
  /** Trusted domain schema/field/identity validator, never supplied by the artifact. */
  validateContent: (path: string, value: unknown) => boolean;
  /** Trusted cross-file provenance validation; never supplied by the artifact. */
  validateFiles?: (files: Array<{ path: string; content: string }>) => boolean;
  /** Fresh existing project publication planner input; never artifact-supplied. */
  projectPublication?: Record<string, unknown>;
}
export interface PreparedResultContext {
  operation: AutomationOperation;
  run: TrustedPreparationRun;
  publisherActorId: number;
  currentState: PreparedCurrentState;
}
export const PREPARED_RESULT_SCHEMA: Record<string, unknown>;
export function assertTrustedPreparationOrigin(input: {
  kind: AutomationKind;
  repository: string;
  run: TrustedPreparationRun;
  publisherActorId: number;
}): void;
export function assertTrustedPreparedProducer(input: {
  kind: AutomationKind;
  repository: string;
  run: TrustedPreparationRun;
  publisherActorId: number;
  requireSuccess?: boolean;
}): void;
export function validatePreparedResult(
  result: unknown,
  context: PreparedResultContext,
): PreparedResult;
