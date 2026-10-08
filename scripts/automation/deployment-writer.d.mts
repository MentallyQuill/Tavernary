import type { RevisionManifest } from "./revision-manifest.mjs";
import type { ConfirmationResult } from "./confirm-deployment.mjs";
import type { commitCanonicalData } from "./canonical-data.mjs";
export interface CanonicalConfirmationState {
  revision: string;
  nowMs: number;
  deployments: unknown[];
}
export interface CanonicalConfirmationInput {
  runId: number;
  load: () => Promise<CanonicalConfirmationState>;
  loadManifest: (input: {
    runId: number;
    revision: string;
  }) => Promise<{ runId: number; manifest: RevisionManifest }>;
  probe: (input: { expected: RevisionManifest }) => Promise<ConfirmationResult>;
  commit: (
    input: Omit<Parameters<typeof commitCanonicalData>[0], "gh" | "repository">,
  ) => Promise<{ sha: string }>;
  isAncestor: (ancestor: string, descendant: string) => boolean | null;
}
export function confirmCanonicalDeployment(
  input: CanonicalConfirmationInput,
): Promise<
  | Exclude<ConfirmationResult, { status: "confirmed" }>
  | { status: "already-confirmed"; sourceSha: string }
  | { status: "confirmed"; sourceSha: string; revision: string }
>;
