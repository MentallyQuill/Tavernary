import type { ProjectPublicationTransaction } from "../publication/project-publication-transaction.mjs";

export type ProjectValidationRun = {
  id?: number;
  head_sha?: string;
  status?: string;
  conclusion?: string | null;
  run_attempt?: number;
  created_at?: string;
  updated_at?: string;
  html_url?: string;
};

export type ProjectValidationState =
  | "validating"
  | "retrying-validation"
  | "validation-blocked"
  | "handoff"
  | "publishing"
  | "retrying-publication"
  | "publication-blocked"
  | "regenerating"
  | "retrying-regeneration"
  | "regeneration-blocked"
  | "published";

export type ProjectValidationPlan =
  | { action: "ignore" }
  | {
      action:
        | "wait"
        | "validate"
        | "retry-validation"
        | "publish"
        | "retry-publication"
        | "regenerate"
        | "block";
      state: ProjectValidationState;
      attempts: number;
      run: ProjectValidationRun | null;
      validationRunId?: number;
    };

export const PROJECT_VALIDATION_RETRY_LIMIT: number;
export const PROJECT_VALIDATION_HANDOFF_GRACE_MS: number;
export const PROJECT_VALIDATION_REGENERATION_GRACE_MS: number;
export const PROJECT_VALIDATION_OWNED_LABELS: readonly [string, string];
export const PROJECT_VALIDATION_STATE_MARKER: string;

export function planProjectValidationReconciliation(input: {
  transaction: ProjectPublicationTransaction | null;
  headSha: string;
  validationRuns: ProjectValidationRun[];
  publicationRuns: ProjectValidationRun[];
  generationRuns?: ProjectValidationRun[];
  nowMs: number;
  pull?: { updated_at?: string };
}): ProjectValidationPlan;

export function projectValidationStateComment(input: {
  state: ProjectValidationState;
  headSha: string;
  attempts: number;
  run?: ProjectValidationRun | null;
}): string;
