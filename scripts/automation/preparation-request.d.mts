import type { AutomationInventoryState } from "./inventory.mjs";
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
}):
  | { action: "wait" }
  | {
      action: "dispatch";
      workflow: string;
      inputs: { issue_number: string; operation_key: string };
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
