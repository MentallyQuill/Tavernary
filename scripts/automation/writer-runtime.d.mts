import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { PublicationResult } from "./publish.mjs";
export function synchronizeWriterCheckout(input: {
  root: string;
  env?: Record<string, string | undefined>;
  run?: (
    command: string,
    args: string[],
    options: {
      cwd: string;
      encoding: string;
      env: NodeJS.ProcessEnv;
      timeout: number;
    },
  ) => Promise<string>;
}): Promise<void>;
export function downloadPreparedArtifact(
  args: string[],
  options?: {
    run?: (
      command: string,
      args: string[],
      options: { encoding: string; maxBuffer: number; timeout: number },
    ) => Promise<Uint8Array>;
  },
): Promise<Uint8Array>;
export function runPreparedWriterPublication(input: {
  operationKey: string;
  runId: number;
  root?: string;
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
}): Promise<PublicationResult>;
export function runAutomationWriterReconciliation(input?: {
  root?: string;
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
}): Promise<Record<string, unknown>>;
