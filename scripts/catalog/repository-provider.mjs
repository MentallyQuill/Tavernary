import { CodebergRepositoryProvider } from "./codeberg-repository-provider.mjs";
import { GitHubRepositoryProvider } from "./github-repository-provider.mjs";

export function repositoryProvider(provider, clients = {}) {
  if (typeof clients[provider]?.resolve === "function") {
    return clients[provider];
  }
  if (provider === "github") {
    return new GitHubRepositoryProvider(clients.github);
  }
  if (provider === "codeberg") {
    return new CodebergRepositoryProvider(clients.codeberg);
  }
  throw new Error(`Unsupported repository provider: ${provider}`);
}
