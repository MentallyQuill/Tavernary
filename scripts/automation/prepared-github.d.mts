import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { AutomationFailure } from "./failure.mjs";
import type {
  PreparedResult,
  PreparedResultContext,
  TrustedPreparationRun,
} from "./prepared-result.mjs";
export function loadPreparedGithubArtifact(
  input: Omit<PreparedResultContext, "run" | "currentState"> & {
    gh: GhRunner;
    repository: string;
    runId: number;
    allowMissing?: boolean;
    artifactKind?: "result" | "diagnostic" | "generation-usage";
  },
): Promise<{
  run: TrustedPreparationRun;
  artifact: { id: number; digest: string };
} | null>;
export function loadPreparedGithubArtifact(input: {
  operation: { key: string; identity: { kind: "project" | "owner-request" } };
  gh: GhRunner;
  repository: string;
  runId: number;
  publisherActorId: number;
  allowMissing?: boolean;
  artifactKind: "generation-usage" | "generation-checkpoint";
}): Promise<{
  run: TrustedPreparationRun;
  artifact: { id: number; digest: string };
} | null>;
export function loadPreparedGithubResult(
  input: Omit<PreparedResultContext, "run"> & {
    gh: GhRunner;
    download: (args: string[]) => Promise<Uint8Array>;
    repository: string;
    runId: number;
  },
): Promise<PreparedResult>;
export function loadPreparedGithubDiagnostic(
  input: Omit<PreparedResultContext, "run" | "currentState"> & {
    gh: GhRunner;
    download: (args: string[]) => Promise<Uint8Array>;
    repository: string;
    runId: number;
  },
): Promise<AutomationFailure>;
