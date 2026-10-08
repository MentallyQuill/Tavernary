import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export interface RestoreSource {
  schema_version: 1;
  runId: number;
  runAttempt: number;
  headSha: string;
  ownerActorId: 2625904;
  releaseId: number;
  sourceSha: string;
  buildId: string;
  buildDigest: string;
  archiveDigest: string;
  catalogDigest: string;
  targetDigest: string;
  baselineSha: string;
  reason: string;
  dryRun: false;
}
export function validateRestoreSource(value: unknown): RestoreSource;
export interface RestoreSourceInput {
  repository: string;
  runId: number;
  currentMainSha: string;
  isAncestor: (ancestor: string, descendant: string) => boolean | null;
}
export function trustedRestoreRun(
  run: unknown,
  input: RestoreSourceInput,
): boolean;
export function loadGithubRestoreSource(
  input: RestoreSourceInput & {
    gh: GhRunner;
    download: (args: string[]) => Promise<Uint8Array>;
  },
): Promise<RestoreSource>;
