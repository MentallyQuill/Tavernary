import type { ActivityEvidence } from "./activity-evidence.mjs";

export type DeltaFallbackReason =
  | "history-not-ahead"
  | "commit-limit"
  | "file-limit"
  | "stale-observation"
  | "multiweek"
  | "compare-unavailable"
  | "malformed-compare";

export type DeltaInspection =
  | {
      kind: "accepted-source";
      activityAt: string;
      licenseChanged: boolean;
      requestCount: number;
    }
  | {
      kind: "accepted-excluded";
      licenseChanged: boolean;
      requestCount: number;
    }
  | {
      kind: "fallback";
      reason: DeltaFallbackReason;
      requestCount: number;
    };

export interface DeltaInput {
  repository: string;
  baseSha: string;
  headSha: string;
  hoursSinceLastSuccess: number;
  crossesAmbiguousWeeks: boolean;
}

export function inspectDelta(
  input: DeltaInput,
  options: {
    fetchCompare(input: DeltaInput): Promise<unknown>;
    maxRetries?: number;
    delay?: (milliseconds: number) => Promise<void>;
    logger?: { log(message: string): void; error(message: string): void };
  },
): Promise<DeltaInspection>;

export function inspectGitBaseline(
  input: {
    repository: string;
    defaultBranch: string;
    expectedHeadSha: string;
    headCommittedAt: string;
    now: string;
    activity: ActivityEvidence;
  },
  options?: {
    runGit?: (
      cwd: string,
      args: string[],
      options: {
        timeout: number;
        maxBuffer: number;
        windowsHide: boolean;
      },
    ) => Promise<string | { stdout: string }>;
    makeTemporaryRoot?: () => Promise<string>;
    cleanup?: (temporaryRoot: string) => Promise<void>;
  },
): Promise<{
  activity: ActivityEvidence;
  license: {
    status: "osi-approved" | "proprietary" | "missing";
    spdxId: string | null;
    sourcePath: string | null;
  };
  sourceCommitCount: number;
  cutoffIso: string;
}>;

export type SettledResult<T> =
  { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown };

export function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<SettledResult<R>>>;
