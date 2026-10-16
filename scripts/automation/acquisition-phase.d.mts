export type AcquisitionPhase =
  | "operation-records"
  | "observe-source"
  | "source-setup"
  | "source-repository-request"
  | "source-readme-prepare"
  | "source-readme-request"
  | "source-normalize"
  | "budget-guard"
  | "provider-config"
  | "provider-input"
  | "provider-review"
  | "provider-output"
  | "acquisition-output";
export type AcquisitionPhaseCallback = (phase: AcquisitionPhase) => void;
export function isAcquisitionPhase(phase: unknown): phase is AcquisitionPhase;
export function markAcquisitionPhase(target: unknown, phase: unknown): void;
