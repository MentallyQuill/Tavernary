export interface GitHubContributorAccount {
  login: string;
  type: string;
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
