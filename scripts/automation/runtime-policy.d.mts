export interface SupportedRuntimes {
  schemaVersion: 1;
  productionMajor: number;
  warningDays: 90;
}
export interface NodeRelease {
  start: string;
  lts?: string | false;
  maintenance?: string;
  end: string;
  codename?: string;
}
export interface RuntimeResult {
  major: number;
  baseSha: string;
  headSha: string;
  currentVerified: boolean;
  candidateVerified: boolean;
  coupledDiffVerified: boolean;
}
export interface RuntimeDecision {
  action: "keep" | "verify" | "transition" | "incident";
  healthy: boolean;
  reason: string;
  currentMajor: number;
  candidateMajor?: number;
  supportEnds: string;
}
export function validateSupportedRuntimes(value: unknown): SupportedRuntimes;
export function validateOfficialNodeSchedule(
  value: unknown,
): Array<{
  major: number;
  start: number;
  lts: number | null;
  maintenance: number | null;
  end: number;
}>;
export function planRuntimeTransition(input: {
  supported: SupportedRuntimes;
  officialSchedule: Record<string, NodeRelease>;
  candidateResults?: RuntimeResult[];
  nowMs: number;
}): RuntimeDecision;
export const RUNTIME_PROPOSAL_PATHS: readonly string[];
export function runtimeDocumentation(major: number): string;
export function inspectRuntimeProposal(input: {
  before: Record<string, string>;
  after: Record<string, string>;
  candidateMajor: number;
}): { currentMajor: number; candidateMajor: number };
