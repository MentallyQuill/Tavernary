import type { ActivityEvidence } from "./activity-evidence.mjs";
import type { ActivityScan } from "./github-inspector.mjs";
import type { RepositoryObservation } from "./github-observer.mjs";

export interface ContributorAccount {
  login: string;
  type: string;
}

export interface ContributorSnapshot {
  accounts: ContributorAccount[];
  refreshed_at: string;
  stale_since: string | null;
}

export interface NormalizedLicense {
  status: "osi-approved" | "proprietary" | "missing";
  spdx_id: string | null;
  source_path: string | null;
}

export interface RepositorySnapshot {
  schema_version: 2;
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
    created_at: string;
    size_kb: number;
  };
  contributors?: ContributorSnapshot;
  source_health: "healthy";
  activity_scan?: ActivityScan | null;
  activity: ActivityEvidence;
  community: {
    stargazers_count: number;
    forks_count: number;
    subscribers_count: number;
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
): RepositorySnapshot["repository"];

export function provisionalActivity(): ActivityEvidence;

export function defaultLicense(
  previous?: NormalizedLicense | null,
): NormalizedLicense;

export function normalizedLicense(
  license: NonNullable<ApiActivityInspection["license"]>,
): NormalizedLicense;

export function contributorSnapshotForSuccess(
  accounts: ContributorAccount[],
  now: string,
): ContributorSnapshot;

export function contributorSnapshotForFailure<T extends ContributorSnapshot>(
  previous: T | undefined,
  now: string,
): T | undefined;

export function snapshotFromObservation(input: {
  projectId: string;
  observation: RepositoryObservation;
  previous?: RepositorySnapshot | null;
  now: string;
  contributors?: ContributorSnapshot;
}): RepositorySnapshot;

export function createInitialRepositorySnapshot(input: {
  projectId: string;
  observation: RepositoryObservation;
  activityInspection: ApiActivityInspection;
  contributors: ContributorAccount[];
  now: string;
}): RepositorySnapshot;
