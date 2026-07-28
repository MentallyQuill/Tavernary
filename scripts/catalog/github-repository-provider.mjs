import {
  fetchForkContributors,
  fetchRepositoryContributors,
} from "./github-contributors.mjs";
import { inspectApiActivity } from "./github-inspector.mjs";
import { observeRepositories } from "./github-observer.mjs";

const githubApi = "https://api.github.com";

function tokenFromEnvironment() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
}

async function githubJson(path, options = {}) {
  const token = options.token ?? tokenFromEnvironment();
  const response = await (options.fetchImpl ?? fetch)(`${githubApi}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "User-Agent": "Tavernary-repository-provider",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(
      `GitHub request failed with status ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function previousForkContributorState(previous) {
  if (previous?.method !== "merged-pull-requests") return null;
  return {
    accounts: previous.accounts,
    baselineCompletedAt: previous.baseline_completed_at ?? null,
    refreshedAt: previous.refreshed_at,
    scan: previous.scan
      ? {
          nextPage: previous.scan.next_page,
          cutoffAt: previous.scan.cutoff_at,
          targetWatermark: previous.scan.target_watermark,
        }
      : null,
  };
}

export class GitHubRepositoryProvider {
  name = "github";
  snapshotDirectory = "data/snapshots/github";

  constructor(clients = {}) {
    this.clients = {
      observeRepositories,
      inspectApiActivity,
      fetchRepositoryContributors,
      fetchForkContributors,
      ...clients,
    };
    this.token = clients.token ?? tokenFromEnvironment();
    this.fetchImpl = clients.fetchImpl ?? fetch;
  }

  async resolve(identity) {
    if (identity.provider !== this.name) {
      throw new Error(
        `GitHub provider cannot resolve ${identity.provider} identity.`,
      );
    }
    const resolved = this.clients.resolveRepository
      ? await this.clients.resolveRepository(identity)
      : await githubJson(
          `/repos/${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.name)}`,
          { token: this.token, fetchImpl: this.fetchImpl },
        );
    if (
      !resolved ||
      !Number.isInteger(resolved.id) ||
      typeof (resolved.owner?.login ?? resolved.owner) !== "string" ||
      typeof resolved.name !== "string"
    ) {
      throw new Error(
        "GitHub repository resolution returned invalid identity.",
      );
    }
    const owner = resolved.owner?.login ?? resolved.owner;
    return {
      kind: "repository",
      provider: this.name,
      canonicalUrl: `https://github.com/${owner}/${resolved.name}`,
      repository: `${owner}/${resolved.name}`,
      repositoryId: resolved.id,
      owner,
      name: resolved.name,
    };
  }

  async observe(records) {
    const result = await this.clients.observeRepositories(records, {
      token: this.token,
      fetchImpl: this.fetchImpl,
    });
    return {
      ...result,
      observations: result.observations.map((observation) => ({
        ...observation,
        provider: this.name,
        community: {
          starsCount: observation.community.stargazersCount,
          forksCount: observation.community.forksCount,
          watchersCount: observation.community.subscribersCount,
        },
      })),
    };
  }

  inspectActivity(input) {
    return this.clients.inspectApiActivity(input, {
      token: this.token,
      fetchImpl: this.fetchImpl,
    });
  }

  async collectContributors(repository, context) {
    if (!repository.fork) {
      return {
        ...(await this.clients.fetchRepositoryContributors(repository, {
          token: this.token,
          fetchImpl: this.fetchImpl,
        })),
        method: "repository-contributors",
      };
    }
    return {
      ...(await this.clients.fetchForkContributors(repository, {
        token: this.token,
        now: context.now,
        previous: previousForkContributorState(context.previous),
        fetchImpl: this.fetchImpl,
      })),
      method: "merged-pull-requests",
    };
  }

  async readRootReadme(input) {
    if (this.clients.readRootReadme) {
      return this.clients.readRootReadme(input);
    }
    const [owner, name] = input.repository.split("/");
    return githubJson(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/readme?ref=${encodeURIComponent(input.ref)}`,
      { token: this.token, fetchImpl: this.fetchImpl },
    );
  }
}
