import { GitHubRepositoryProvider } from "./github-repository-provider.mjs";

export function repositoryProvider(provider, clients = {}) {
  if (provider === "github") {
    return new GitHubRepositoryProvider(clients.github);
  }
  throw new Error(`Unsupported repository provider: ${provider}`);
}
