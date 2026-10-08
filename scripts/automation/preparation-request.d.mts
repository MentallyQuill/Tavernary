import type { AutomationInventoryState } from "./inventory.mjs";
export interface GenerationOwnerRequest {
  runId: number;
  sourceSha: string;
  issueNumber: number;
  kind: "project" | "owner-request";
  workflow: string;
  forceRegeneration: boolean;
  ownerAuthorized: boolean;
}
export function parseGenerationOwnerRequest(
  run: unknown,
  repository: string,
  publisherActorId: number,
): GenerationOwnerRequest | null;
export function generationRequestOperation(
  state: AutomationInventoryState,
  request: Pick<
    GenerationOwnerRequest,
    "issueNumber" | "kind" | "ownerAuthorized"
  >,
): import("./operation.mjs").AutomationOperation | null;
export function generationRequestCompleted(input: {
  state: AutomationInventoryState;
  request: GenerationOwnerRequest;
  gh: import("../submissions/kit-submission-reconciliation.mjs").GhRunner;
  isAncestor: (ancestor: string, descendant: string) => boolean | null;
}): Promise<boolean>;
export function planReportPreparationRequests(input: {
  state: AutomationInventoryState;
  reportDigest?: string;
}): Array<{
  workflow: "automation-writer.yml" | "import-tavernkeeper-reports.yml";
  inputs: { operation_key: string; mode?: "prepare" };
}>;
export function planRefreshPreparationRequests(input: {
  state: AutomationInventoryState;
  mode?: "incremental" | "baseline" | "project" | "forensic";
  sourceId?: string;
  batchSize?: number;
}): Array<{
  workflow: "refresh-catalog.yml";
  inputs: {
    mode: "project" | "forensic";
    source_id: string;
    operation_key: string;
  };
}>;
export function planAdvisoryPreparationRequests(input: {
  state: AutomationInventoryState;
  projectId?: string;
}): Array<{
  workflow: "automation-writer.yml";
  inputs: { mode: "prepare" | "advisory-notice"; operation_key: string };
}>;
export function planPreparationRequest(input: {
  state: AutomationInventoryState;
  workflow: string;
  issueNumber: number;
  ownerAuthorized?: boolean;
  requestRunId?: number;
}):
  | { action: "wait" }
  | {
      action: "dispatch";
      workflow: string;
      inputs:
        | { issue_number: string; operation_key: string }
        | { mode: "prepare"; operation_key: string; result_run_id?: string };
    };
export function runPreparationRequestCli(options?: {
  env?: Record<string, string | undefined>;
  event?: { inputs?: Record<string, string> };
  load?: () => Promise<AutomationInventoryState>;
  feedback?: (input: {
    state: AutomationInventoryState;
    issueNumber: number;
  }) => Promise<void>;
  write?: (value: string) => void;
}): Promise<number>;
