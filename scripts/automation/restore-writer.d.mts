import type { ActiveDeployment } from "./deployment-state.mjs";
import type { RestoreSource } from "./restore-source.mjs";
import type { loadRetainedGithubSiteBundle } from "./site-bundle-github.mjs";
import type { confirmPublicDeployment } from "./confirm-deployment.mjs";
import type { commitCanonicalData } from "./canonical-data.mjs";
export interface RestoreWriterState {
  revision: string;
  nowMs: number;
  activeDeployment: ActiveDeployment | null;
}
export interface RestoreWriterInput {
  runId: number;
  load: () => Promise<RestoreWriterState>;
  loadSource: (input: {
    runId: number;
    revision: string;
  }) => Promise<RestoreSource>;
  loadBundle: (input: {
    releaseId: number;
    revision: string;
    nowMs: number;
  }) => ReturnType<typeof loadRetainedGithubSiteBundle>;
  probe: (
    input: Parameters<typeof confirmPublicDeployment>[0],
  ) => ReturnType<typeof confirmPublicDeployment>;
  commit: (
    input: Omit<Parameters<typeof commitCanonicalData>[0], "gh" | "repository">,
  ) => Promise<{ sha: string }>;
  isAncestor: (ancestor: string, descendant: string) => boolean | null;
}
export function confirmRestoredDeployment(
  input: RestoreWriterInput,
): Promise<Record<string, unknown>>;
