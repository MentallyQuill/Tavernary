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
export function reconcileGenerationOwnerRequests(input: {
  state: AutomationInventoryState;
  gh: GhRunner;
  prepare: (input: { requestRunId: number }) => Promise<{ status: string }>;
  isAncestor: (ancestor: string, descendant: string) => boolean | null;
  limit?: number;
}): Promise<{
  status: string;
  slots: number;
  consumedKeys: string[];
}>;
export function runEnrichmentOwnerWriter(input: {
  runId: number;
  root?: string;
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
  load?: () => Promise<AutomationInventoryState>;
  commit?: (
    input: Omit<Parameters<typeof commitCanonicalData>[0], "gh">,
  ) => Promise<{ sha: string }>;
  isAncestor?: (ancestor: string, descendant: string) => boolean | null;
}): Promise<Record<string, unknown>>;
export function runPublicationWriterFinalization(
  input: ProjectWriterInput & {
    noticeOnly?: boolean;
    persist?: (
      receipt: import("./receipts.mjs").AutomationReceipt,
    ) => Promise<void>;
    commit?: (
      input: Omit<Parameters<typeof commitCanonicalData>[0], "gh">,
    ) => Promise<{ sha: string }>;
    project?: (
      operation: import("./operation.mjs").AutomationOperation,
      state: AutomationInventoryState,
    ) => Promise<{ status: "complete" | "superseded" | "waiting" }>;
  },
): Promise<Record<string, unknown>>;
export function runGenerationModelWriterSettlement(
  input: ProjectWriterInput & {
    download?: (args: string[]) => Promise<Uint8Array>;
    commit?: (
      input: Omit<Parameters<typeof commitCanonicalData>[0], "gh">,
    ) => Promise<{ sha: string }>;
  },
): Promise<{ status: "idle" | "waiting" | "settled" | "recovered" }>;
export function reconcileGenerationModelUsage(input: {
  state: AutomationInventoryState;
  limit?: number;
  settle: (input: { operationKey: string }) => Promise<{ status: string }>;
  onFailure?: (input: {
    operationKey: string;
    error: unknown;
  }) => Promise<unknown>;
}): Promise<{ slots: number; consumedKeys: string[]; failures: number }>;
export function runModelWriterPreparation(
  input: Omit<ProjectWriterInput, "operationKey"> & {
    operationKey?: string;
    requestRunId?: number;
    isRequestAncestor?: (
      ancestor: string,
      descendant: string,
    ) => boolean | null;
    persistFailure?: (error: unknown) => Promise<void>;
    metadataCached?: (input: {
      state: AutomationInventoryState;
      operation: import("./operation.mjs").AutomationOperation;
    }) => Promise<boolean>;
    enrichmentCached?: (input: {
      state: AutomationInventoryState;
      operation: import("./operation.mjs").AutomationOperation;
    }) => Promise<boolean>;
    projectGenerationEligible?: (input: {
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
export function runDeploymentWriterConfirmation(input: {
  operationKey?: string;
  runId?: number;
  root?: string;
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
  load?: () => Promise<AutomationInventoryState>;
  download?: (args: string[]) => Promise<Uint8Array>;
  isAncestor?: (ancestor: string, descendant: string) => boolean | null;
  probe?: (input: {
    expected: import("./revision-manifest.mjs").RevisionManifest;
    maxAttempts?: number;
  }) => Promise<import("./confirm-deployment.mjs").ConfirmationResult>;
  commit?: (
    input: Omit<Parameters<typeof commitCanonicalData>[0], "gh">,
  ) => Promise<{ sha: string }>;
}): Promise<Record<string, unknown>>;
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
  load?: () => Promise<AutomationInventoryState>;
}): Promise<Record<string, unknown>>;
export function runPreparedWriterBatch(input: {
  wakes: { operationKey: string; runId: number }[];
  root?: string;
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
}): Promise<PublicationResult>;
