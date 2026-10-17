export function generationRequestMode(
  inputs?: Record<string, unknown>,
): "direct" | "legacy";
export type DirectGenerationPlan =
  { action: "generate" } | { action: "wait"; reason: string };
export function planDirectGeneration(
  input: import("./project-operations.mjs").ProjectInventoryInput & {
    currentRunId: number;
    currentMainSha?: string;
    forceRegeneration?: boolean;
  },
): DirectGenerationPlan;
export function runDirectGenerationGuard(input?: {
  env?: Record<string, string | undefined>;
  gh?: (args: string[]) => Promise<string>;
  root?: string;
}): Promise<DirectGenerationPlan>;
export function isDirectSubmissionKind(kind: unknown): boolean;
