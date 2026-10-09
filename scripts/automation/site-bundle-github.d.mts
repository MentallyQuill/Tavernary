import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { VerifiedBundle } from "./site-bundle.mjs";
import type { GithubRevisionInput } from "./deployment-github.mjs";
import type { ConfirmedDeployment } from "./confirm-deployment.mjs";
export interface RetentionState {
  revision: string;
  nowMs: number;
  deployments: unknown[];
  protectedBundleIds?: number[];
}
export function listGithubSiteReleases(
  gh: GhRunner,
  route: string,
): Promise<Array<{ tag_name?: string; [key: string]: unknown }>>;
export interface GithubRetentionInput {
  runId: number;
  env?: Record<string, string | undefined>;
  load: () => Promise<RetentionState>;
  gh?: GhRunner;
  download?: (args: string[]) => Promise<Uint8Array>;
  isAncestor: (ancestor: string, descendant: string) => boolean | null;
  loadBundle?: (
    input: Omit<GithubRevisionInput, "gh" | "download">,
  ) => Promise<{ runId: number; bundle: VerifiedBundle; archive: Uint8Array }>;
}
export function downloadSiteGithubBytes(
  args: string[],
  options?: {
    run?: (
      command: string,
      args: string[],
      options: {
        encoding: string;
        maxBuffer: number;
        timeout: number;
        windowsHide: boolean;
      },
    ) => Promise<{ stdout: Uint8Array } | Uint8Array>;
  },
): Promise<Uint8Array>;
export function retainGithubSiteBundle(input: GithubRetentionInput): Promise<
  | { status: "superseded" }
  | {
      status: "retained" | "already-retained";
      releaseId: number;
      sourceSha: string;
      archiveDigest: string;
      retention: { keepIds: number[]; removeIds: number[] };
    }
>;
export function loadRetainedGithubSiteBundle(input: {
  repository: string;
  publisherActorId: number;
  releaseId: number;
  currentMainSha: string;
  nowMs: number;
  gh?: GhRunner;
  download?: (args: string[]) => Promise<Uint8Array>;
  isAncestor: (ancestor: string, descendant: string) => boolean | null;
}): Promise<{
  releaseId: number;
  bundle: VerifiedBundle;
  deployment: ConfirmedDeployment & { workflowRunId: number };
}>;
export function inspectRetainedGithubSiteBundle(
  input: Parameters<typeof loadRetainedGithubSiteBundle>[0],
): Promise<{
  releaseId: number;
  deployment: ConfirmedDeployment & { workflowRunId: number };
  archiveDigest: string;
  asset: { id: number; size: number; digest: string };
}>;
