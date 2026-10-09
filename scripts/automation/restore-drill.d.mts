import type { VerifiedBundle } from "./site-bundle.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export function loadRestoreDrillHealth(input: {
  repository: string;
  revision: string;
  gh?: GhRunner;
  isAncestor: (a: string, b: string) => boolean | null;
}): Promise<{ status: "active" | "recovered" }>;
interface DrillDeployment {
  sourceSha: string;
  buildId: string;
  bundleDigest: string;
}
export function prepareGithubRestoreDrill(options?: {
  root?: string;
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
  git?: (args: string[]) => string;
  readActive?: (input: {
    root: string;
    revision: string;
    nowMs?: number;
  }) => { mode: string; deployment: DrillDeployment } | null;
  loadBundle?: (
    input: Parameters<
      typeof import("./site-bundle-github.mjs").loadRetainedGithubSiteBundle
    >[0],
  ) => Promise<{
    releaseId: number;
    bundle: VerifiedBundle;
    deployment: DrillDeployment;
  }>;
}): Promise<{
  status: "restored";
  releaseId: number;
  sourceSha: string;
  buildId: string;
  archiveDigest: string;
  outputDirectory: string;
}>;
