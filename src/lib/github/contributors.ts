export type GitHubAccount = {
  provider?: "github" | "codeberg";
  login: string;
  type: string;
};

export function isBotOrAiAccount(account: GitHubAccount): boolean {
  const login = account.login.toLocaleLowerCase("en");
  return (
    account.type.toLocaleLowerCase("en") === "bot" ||
    login.endsWith("[bot]") ||
    login === "claude" ||
    login.startsWith("claude-") ||
    login.startsWith("claude_")
  );
}

export function catalogAttribution(
  provider: "github" | "codeberg",
  owner: string,
  contributors:
    | {
        accounts: GitHubAccount[];
        method?: "repository-contributors" | "merged-pull-requests";
        baseline_completed_at?: string | null;
        stale_since: string | null;
      }
    | undefined,
) {
  const accounts = (contributors?.accounts ?? [])
    .filter(
      ({ login }) =>
        login.toLocaleLowerCase("en") !== owner.toLocaleLowerCase("en"),
    )
    .map((account) => ({
      provider: account.provider ?? provider,
      login: account.login,
      botOrAi: isBotOrAiAccount(account),
    }));

  return {
    owner: { provider, login: owner },
    contributors: accounts,
    humanContributorCount: accounts.filter(({ botOrAi }) => !botOrAi).length,
    status: !contributors
      ? ("pending" as const)
      : contributors.stale_since
        ? ("stale" as const)
        : contributors.method === "merged-pull-requests" &&
            contributors.baseline_completed_at == null
          ? ("partial" as const)
          : ("current" as const),
  };
}
