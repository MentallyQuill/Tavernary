import type { ActivityEvidence } from "./activity-evidence.mjs";
import type { ActivityScan } from "./github-inspector.mjs";
import type { RepositoryObservation } from "./repository-provider.mjs";

export interface ContributorAccount {
  provider: "github" | "codeberg";
  login: string;
  type: string;
}

export interface ContributorSnapshot {
  accounts: ContributorAccount[];
  method?:
    | "repository-contributors"
    | "merged-pull-requests"
    | "commit-and-merged-pull-request-authors";
  baseline_completed_at?: string | null;
  scan?: {
    next_page: number;
    cutoff_at: string | null;
    target_watermark: string;
  } | null;
  refreshed_at: string;
  stale_since: string | null;
}

export interface NormalizedLicense {
  status: "osi-approved" | "proprietary" | "missing";
  spdx_id: string | null;
  source_path: string | null;
}

export interface RepositorySnapshot {
  schema_version: 3;
  provider: "github" | "codeberg";
  project_id: string;
  repository: {
    id: number;
    owner: string;
    name: string;
    url: string;
    description: string | null;
    default_branch: string;
    head_sha: string;
    head_committed_at: string;
    archived: boolean;
    fork?: boolean;
    parent?: {
      id: number;
      owner: string;
      name: string;
      url: string;
    } | null;
    created_at: string;
    size_kb: number;
  };
  contributors?: ContributorSnapshot;
  source_health: "healthy";
  activity_scan?: ActivityScan | null;
  activity: ActivityEvidence;
  community: {
    stars_count: number;
    forks_count: number;
    watchers_count: number;
    aggregate: number;
  };
  license: NormalizedLicense;
  refreshed_at: string;
  stale_since: null;
}

export interface ApiActivityInspection {
  complete: boolean;
  activity: ActivityEvidence;
  license: {
    status: "osi-approved" | "proprietary" | "missing";
    spdxId: string | null;
    sourcePath: string | null;
  } | null;
  requestCount: number;
  scan: ActivityScan | null;
}

export function repositoryFacts(
  observation: RepositoryObservation["repository"],
  previous?: RepositorySnapshot["repository"] | null,
): RepositorySnapshot["repository"];

export function provisionalActivity(): ActivityEvidence;

export function defaultLicense(
  previous?: NormalizedLicense | null,
): NormalizedLicense;

export function normalizedLicense(
  license: NonNullable<ApiActivityInspection["license"]>,
): NormalizedLicense;

export function contributorSnapshotForSuccess(
  collection:
    | Array<Omit<ContributorAccount, "provider">>
    | {
        accounts: Array<Omit<ContributorAccount, "provider">>;
        method?:
          | "repository-contributors"
          | "merged-pull-requests"
          | "commit-and-merged-pull-request-authors";
        baselineCompletedAt?: string | null;
        refreshedAt?: string | null;
        scan?: {
          nextPage: number;
          cutoffAt: string | null;
          targetWatermark: string;
        } | null;
      },
  now: string,
  provider: "github" | "codeberg",
): ContributorSnapshot;

export function contributorSnapshotForFailure<T extends ContributorSnapshot>(
  previous: T | undefined,
  now: string,
): T | undefined;

export function snapshotFromObservation(input: {
  provider: "github" | "codeberg";
  projectId: string;
  observation: RepositoryObservation;
  previous?: RepositorySnapshot | null;
  now: string;
  contributors?: ContributorSnapshot;
}): RepositorySnapshot;

export function createInitialRepositorySnapshot(input: {
  provider: "github" | "codeberg";
  projectId: string;
  observation: RepositoryObservation;
  activityInspection: ApiActivityInspection;
  contributors:
    | Array<Omit<ContributorAccount, "provider">>
    | {
        accounts: Array<Omit<ContributorAccount, "provider">>;
        method?:
          | "repository-contributors"
          | "merged-pull-requests"
          | "commit-and-merged-pull-request-authors";
        baselineCompletedAt?: string | null;
        refreshedAt?: string | null;
        scan?: {
          nextPage: number;
          cutoffAt: string | null;
          targetWatermark: string;
        } | null;
      };
  now: string;
}): RepositorySnapshot;
