export interface GitHubContributorAccount {
  login: string;
  type: string;
}

export interface ForkContributorScan {
  nextPage: number;
  cutoffAt: string | null;
  targetWatermark: string;
}

export interface ForkContributorCollection {
  accounts: GitHubContributorAccount[];
  requestCount: number;
  baselineCompletedAt: string | null;
  refreshedAt: string | null;
  scan: ForkContributorScan | null;
}

export function fetchRepositoryContributors(
  repository: { owner: string; name: string },
  options: {
    token: string;
    fetchImpl?: typeof fetch;
    perPage?: number;
  },
): Promise<{
  accounts: GitHubContributorAccount[];
  requestCount: number;
}>;

export function fetchForkContributors(
  repository: { owner: string; name: string },
  options: {
    token: string;
    now: string;
    previous?: {
      accounts: GitHubContributorAccount[];
      baselineCompletedAt: string | null;
      refreshedAt: string | null;
      scan: ForkContributorScan | null;
    } | null;
    fetchImpl?: typeof fetch;
    perPage?: number;
    maxPages?: number;
  },
): Promise<ForkContributorCollection>;
