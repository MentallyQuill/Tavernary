import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { RevisionManifest } from "./revision-manifest.mjs";
import type { VerifiedBundle } from "./site-bundle.mjs";
export interface GithubRevisionInput {
  gh: GhRunner;
  download: (args: string[]) => Promise<Uint8Array>;
  repository: string;
  publisherActorId: number;
  runId: number;
  currentMainSha: string;
  expectedSourceSha?: string;
  isAncestor: (ancestor: string, descendant: string) => boolean | null;
}
export function loadGithubRevisionManifest(
  input: GithubRevisionInput,
): Promise<{ runId: number; manifest: RevisionManifest }>;
export function loadGithubSiteBundle(
  input: GithubRevisionInput,
): Promise<{ runId: number; bundle: VerifiedBundle; archive: Uint8Array }>;
