import type { ActivityEvidence } from "./activity-evidence.mjs";
import type { ActivityScan, DeltaInspection } from "./github-inspector.mjs";
import type {
  ContributorSnapshot,
  RepositoryProviderName,
} from "./repository-snapshot.mjs";
import type { RepositorySourceIdentity } from "../submissions/source-identity.mjs";

export type { RepositoryProviderName };

export interface ProviderRepositoryRecord {
  id: string;
  source: {
    type: RepositoryProviderName;
    repository: string;
    repository_id: number | null;
  };
}

export interface RepositoryObservation {
  provider: RepositoryProviderName;
  projectId: string;
  repository: {
    id: number;
    owner: string;
    name: string;
    url: string;
    description: string | null;
    defaultBranch: string;
    headSha: string;
    headCommittedAt: string | null;
    archived: boolean;
    fork: boolean;
    parent?: {
      id: number;
      owner: string;
      name: string;
      url: string;
    } | null;
    createdAt: string;
    sizeKb: number;
  };
  community: {
    starsCount: number;
    forksCount: number;
    watchersCount: number;
  };
  latestReleaseAt: string | null;
  coarseLicenseSpdxId: string | null;
}

export interface ObservationFailure {
  projectId: string;
  kind: "unavailable" | "identity-change" | "missing-default-branch";
  message: string;
}

export interface ObservationRun {
  observations: RepositoryObservation[];
  failures: ObservationFailure[];
  usage: {
    requestCount: number;
    pointCost: number;
    remainingPoints: number | null;
  };
}

export interface ProviderActivityInput {
  repository: string;
  expectedHeadSha: string;
  now: string;
  activity: ActivityEvidence;
  scan: ActivityScan | null;
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

export interface ContributorContext {
  now: string;
  previous?: ContributorSnapshot | null;
}

export interface ContributorCollection {
  accounts: Array<{ login: string; type: string }>;
  requestCount: number;
  method: "repository-contributors" | "merged-pull-requests";
  baselineCompletedAt?: string | null;
  refreshedAt?: string | null;
  scan?: {
    nextPage: number;
    cutoffAt: string | null;
    targetWatermark: string;
  } | null;
}

export interface RepositoryProvider {
  name: RepositoryProviderName;
  snapshotDirectory: string;
  resolve(
    identity: RepositorySourceIdentity,
  ): Promise<RepositorySourceIdentity>;
  observe(records: ProviderRepositoryRecord[]): Promise<ObservationRun>;
  inspectActivity(input: ProviderActivityInput): Promise<ApiActivityInspection>;
  collectContributors(
    repository: RepositoryObservation["repository"],
    context: ContributorContext,
  ): Promise<ContributorCollection>;
  readRootReadme(input: { repository: string; ref: string }): Promise<{
    path: string;
    content: string;
    encoding: "base64";
  } | null>;
}

export interface RepositoryProviderClients {
  github?: ConstructorParameters<
    typeof import("./github-repository-provider.mjs").GitHubRepositoryProvider
  >[0];
}

export function repositoryProvider(
  provider: RepositoryProviderName,
  clients?: RepositoryProviderClients,
): RepositoryProvider;
