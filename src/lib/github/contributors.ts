export type GitHubAccount = {
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
  owner: string,
  contributors:
    | {
        accounts: GitHubAccount[];
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
      login: account.login,
      botOrAi: isBotOrAiAccount(account),
    }));

  return {
    owner,
    contributors: accounts,
    humanContributorCount: accounts.filter(({ botOrAi }) => !botOrAi).length,
    status: !contributors
      ? ("pending" as const)
      : contributors.stale_since
        ? ("stale" as const)
        : ("current" as const),
  };
}
