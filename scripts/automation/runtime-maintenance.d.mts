export function readRuntimeFiles(root: string): Promise<Record<string, string>>;
export function buildRuntimeProposal(input: {
  root: string;
  before: Record<string, string>;
  candidateMajor: number;
  run?: (
    command: string,
    args: string[],
    options: {
      cwd: string;
      timeout: number;
      maxBuffer: number;
      windowsHide: boolean;
      shell?: boolean;
    },
  ) => Promise<unknown>;
}): Promise<Record<string, string>>;
export function loadOfficialNodeSchedule(options?: {
  gh?: (args: string[], stdin?: string) => Promise<string>;
}): Promise<Record<string, import("./runtime-policy.mjs").NodeRelease>>;
export interface RuntimeObservation {
  compatibilityFailed?: boolean;
  before: Record<string, string>;
  revision: string;
  officialSchedule: Record<string, import("./runtime-policy.mjs").NodeRelease>;
  nowMs: number;
}
export function runRuntimeWriter(options?: {
  root?: string;
  env?: Record<string, string | undefined>;
  gh?: (args: string[], stdin?: string) => Promise<string>;
  availableSlots?: number;
  loadRuntime?: () => Promise<RuntimeObservation>;
  buildProposal?: typeof buildRuntimeProposal;
  loadDeployment?: (input: { revision: string }) => Promise<boolean>;
}): Promise<{
  status: string;
  reason: string;
  decision: import("./runtime-policy.mjs").RuntimeDecision;
  pullNumber?: number;
  sha?: string;
}>;
