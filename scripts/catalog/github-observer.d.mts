export interface RepositoryObservation {
  projectId: string;
  repository: {
    id: number;
    owner: string;
    name: string;
    url: string;
    description: string | null;
    defaultBranch: string;
    headSha: string;
    headCommittedAt: string;
    archived: boolean;
    fork?: boolean;
    createdAt: string;
    sizeKb: number;
  };
  community: {
    stargazersCount: number;
    forksCount: number;
    subscribersCount: number;
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

export interface ObservationRecord {
  id: string;
  source: {
    type: "github";
    repository: string;
    repository_id: number | null;
  };
}

export function observeRepositories(
  records: ObservationRecord[],
  options: {
    token: string;
    fetchImpl?: typeof fetch;
    batchSize?: number;
    logger?: { log(message: string): void; error(message: string): void };
    maxRetries?: number;
  },
): Promise<ObservationRun>;
