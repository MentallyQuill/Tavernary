import type { AutomationInventoryState } from "./inventory.mjs";
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
