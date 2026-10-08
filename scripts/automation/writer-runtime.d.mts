import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { PublicationResult } from "./publish.mjs";
import type { AutomationInventoryState } from "./inventory.mjs";
import type { GitHubRequest } from "../submissions/reconcile-project-validations.mjs";
import type { commitCanonicalData } from "./canonical-data.mjs";
import type { dispatchReservedModelPreparation } from "./model-budget-github.mjs";
interface ProjectWriterInput {
  operationKey: string;
  root?: string;
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
  load?: () => Promise<AutomationInventoryState>;
}
export function runModelWriterPreparation(
  input: ProjectWriterInput & {
    persistFailure?: (error: unknown) => Promise<void>;
    metadataCached?: (input: {
      state: AutomationInventoryState;
      operation: import("./operation.mjs").AutomationOperation;
    }) => Promise<boolean>;
    dispatchCached?: (
      input: Omit<
        Parameters<
          typeof import("./model-budget-github.mjs").dispatchUnbudgetedPreparation
        >[0],
        "gh"
      >,
    ) => Promise<{ runId: number; workflow: string }>;
    commit?: (
      input: Omit<Parameters<typeof commitCanonicalData>[0], "gh">,
    ) => Promise<{ sha: string }>;
    dispatch?: (
      input: Omit<Parameters<typeof dispatchReservedModelPreparation>[0], "gh">,
    ) => Promise<{ runId: number; workflow: string }>;
  },
): Promise<Record<string, unknown>>;
export function runProjectWriterPublication(
  input: ProjectWriterInput,
): Promise<PublicationResult>;
export function runProjectWriterReconciliation(
  input: ProjectWriterInput & { request?: GitHubRequest },
): Promise<PublicationResult | Record<string, unknown>>;
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
export function runPreparedWriterBatch(input: {
  wakes: { operationKey: string; runId: number }[];
  root?: string;
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
}): Promise<PublicationResult>;
