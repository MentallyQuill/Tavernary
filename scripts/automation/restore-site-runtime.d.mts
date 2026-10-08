import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { CurrentRollbackData } from "./rollback-canonical.mjs";
import type { loadRetainedGithubSiteBundle } from "./site-bundle-github.mjs";
import type { RollbackDecision } from "./rollback.mjs";
import type { VerifiedBundle } from "./site-bundle.mjs";
export interface GithubRestoreInput {
  root?: string;
  env?: Record<string, string | undefined>;
  inputs: {
    release_id: string | number;
    reason: string;
    dry_run?: string | boolean;
  };
  outputDirectory?: string;
  gh?: GhRunner;
  download?: (args: string[]) => Promise<Uint8Array>;
  git?: (args: string[]) => string;
  readCurrent?: () => Promise<CurrentRollbackData>;
  loadBundle?: (
    input: Parameters<typeof loadRetainedGithubSiteBundle>[0],
  ) => Promise<{ releaseId: number; bundle: VerifiedBundle }>;
  nowMs?: number;
  expectedSourceSha?: string;
  expectedBuildId?: string;
  latestPublishable?: (input: { root: string; revision: string }) => string;
}
export function runGithubSiteRestore(input: GithubRestoreInput): Promise<
  | {
      status: "rejected";
      action: "reject";
      releaseId: number;
      decision: RollbackDecision;
    }
  | {
      status: "verified";
      action: "verified" | "deploy";
      releaseId: number;
      sourceSha: string;
      buildId: string;
      buildDigest: string;
      archiveDigest: string;
      catalogDigest: string;
      targetDigest: string;
      baselineSha: string;
      decision: RollbackDecision;
    }
>;
