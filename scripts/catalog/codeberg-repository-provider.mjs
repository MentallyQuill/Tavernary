import { codebergRequest } from "./codeberg-client.mjs";
import { inspectApiActivity } from "./github-inspector.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 12 * 7;
const MAX_HISTORY_PAGES = 25;
const MAX_CONTRIBUTOR_PAGES = 10;
const rootLicensePattern = /^(?:licen[cs]e|copying)(?:[._-].*)?$/iu;

function repositoryPath(repository) {
  return repository
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function timestamp(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function linkedLogin(value) {
  return typeof value?.login === "string" && value.login.trim()
    ? value.login.trim()
    : null;
}

function decodeContent(value) {
  if (value?.encoding !== "base64" || typeof value.content !== "string") {
    return null;
  }
  try {
    return Buffer.from(value.content.replace(/\s/gu, ""), "base64").toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

export class CodebergRepositoryProvider {
  name = "codeberg";
  snapshotDirectory = "data/snapshots/codeberg";

  constructor(clients = {}) {
    this.request = clients.request ?? codebergRequest;
    this.inspect = clients.inspectApiActivity ?? inspectApiActivity;
  }

  async resolve(identity) {
    if (identity.provider !== this.name) {
      throw new Error(
        `Codeberg provider cannot resolve ${identity.provider} identity.`,
      );
    }
    const { data } = await this.request(
      `/repos/${repositoryPath(identity.repository)}`,
    );
    if (
      !Number.isInteger(data?.id) ||
      typeof data?.owner?.login !== "string" ||
      typeof data?.name !== "string"
    ) {
      throw new Error(
        "Codeberg repository resolution returned invalid identity.",
      );
    }
    const owner = data.owner.login;
    return {
      kind: "repository",
      provider: this.name,
      canonicalUrl: `https://codeberg.org/${owner}/${data.name}`,
      repository: `${owner}/${data.name}`,
      repositoryId: data.id,
      owner,
      name: data.name,
    };
  }

  async observe(records) {
    const observations = [];
    const failures = [];
    let requestCount = 0;
    let remainingPoints = null;
    for (const record of records) {
      try {
        const repositoryResponse = await this.request(
          `/repos/${repositoryPath(record.source.repository)}`,
        );
        requestCount += 1;
        remainingPoints =
          repositoryResponse.rateLimit?.remaining ?? remainingPoints;
        const repository = repositoryResponse.data;
        if (
          record.source.repository_id !== null &&
          repository.id !== record.source.repository_id
        ) {
          failures.push({
            projectId: record.id,
            kind: "identity-change",
            message: "Codeberg repository permanent identity changed.",
          });
          continue;
        }
        const commitsResponse = await this.request(
          `/repos/${repositoryPath(record.source.repository)}/commits?sha=${encodeURIComponent(repository.default_branch)}&page=1&limit=1`,
        );
        requestCount += 1;
        const head = Array.isArray(commitsResponse.data)
          ? commitsResponse.data[0]
          : null;
        if (!head?.sha) {
          failures.push({
            projectId: record.id,
            kind: "missing-default-branch",
            message: "Codeberg repository default branch has no head commit.",
          });
          continue;
        }
        let releases = [];
        try {
          const releaseResponse = await this.request(
            `/repos/${repositoryPath(record.source.repository)}/releases?limit=1`,
          );
          requestCount += 1;
          releases = Array.isArray(releaseResponse.data)
            ? releaseResponse.data
            : [];
        } catch (error) {
          requestCount += 1;
          if (error?.status !== 404) throw error;
        }
        observations.push({
          provider: this.name,
          projectId: record.id,
          repository: {
            id: repository.id,
            owner: repository.owner.login,
            name: repository.name,
            url: repository.html_url,
            description: repository.description?.trim() || null,
            defaultBranch: repository.default_branch,
            headSha: head.sha,
            headCommittedAt: timestamp(
              head.commit?.committer?.date ??
                head.commit?.author?.date ??
                head.created,
            ),
            archived: repository.archived === true,
            fork: repository.fork === true,
            parent: repository.parent
              ? {
                  id: repository.parent.id,
                  owner: repository.parent.owner.login,
                  name: repository.parent.name,
                  url: repository.parent.html_url,
                }
              : null,
            createdAt: timestamp(repository.created_at),
            sizeKb: repository.size,
          },
          community: {
            starsCount: repository.stars_count ?? 0,
            forksCount: repository.forks_count ?? 0,
            watchersCount: repository.watchers_count ?? 0,
          },
          latestReleaseAt:
            timestamp(releases[0]?.published_at ?? releases[0]?.created_at) ??
            null,
          coarseLicenseSpdxId:
            repository.license?.spdx_id ?? repository.license?.key ?? null,
        });
      } catch (error) {
        if (error?.status === 404) {
          requestCount += 1;
          failures.push({
            projectId: record.id,
            kind: "unavailable",
            message: "Codeberg repository is unavailable.",
          });
          continue;
        }
        throw error;
      }
    }
    return {
      observations,
      failures,
      usage: { requestCount, pointCost: 0, remainingPoints },
    };
  }

  async inspectActivity(input) {
    const before = { count: 0 };
    const request = async (path) => {
      before.count += 1;
      return this.request(path);
    };
    const result = await this.inspect(input, {
      maxHistoryPages: MAX_HISTORY_PAGES,
      fetchCommitsPage: async ({ repository, headSha, cutoffAt, page }) => {
        const { data } = await request(
          `/repos/${repositoryPath(repository)}/commits?sha=${encodeURIComponent(headSha)}&page=${page}&limit=100`,
        );
        return (Array.isArray(data) ? data : [])
          .map((entry) => ({
            sha: entry.sha,
            committedAt:
              timestamp(
                entry.commit?.committer?.date ??
                  entry.commit?.author?.date ??
                  entry.created,
              ) ?? entry.created,
            parentCount: Array.isArray(entry.parents)
              ? entry.parents.length
              : 0,
          }))
          .filter(
            (entry) =>
              new Date(entry.committedAt).getTime() >=
              new Date(cutoffAt).getTime(),
          );
      },
      fetchCommitFiles: async ({ repository, sha }) => {
        const { data } = await request(
          `/repos/${repositoryPath(repository)}/git/commits/${encodeURIComponent(sha)}`,
        );
        return (Array.isArray(data?.files) ? data.files : []).map((file) => ({
          filename: file.filename,
          patch: typeof file.patch === "string" ? file.patch : undefined,
        }));
      },
      fetchRootLicenses: async ({ repository, headSha }) => {
        const { data: root } = await request(
          `/repos/${repositoryPath(repository)}/contents?ref=${encodeURIComponent(headSha)}`,
        );
        const licenseFiles = (Array.isArray(root) ? root : []).filter(
          (entry) =>
            entry.type === "file" && rootLicensePattern.test(entry.path),
        );
        const contents = [];
        for (const entry of licenseFiles) {
          const { data } = await request(
            `/repos/${repositoryPath(repository)}/contents/${encodeURIComponent(entry.path)}?ref=${encodeURIComponent(headSha)}`,
          );
          const content = decodeContent(data);
          if (content !== null) contents.push({ path: entry.path, content });
        }
        return contents;
      },
    });
    return { ...result, requestCount: before.count };
  }

  async collectContributors(repository, context) {
    const cutoffAt = new Date(
      new Date(context.now).getTime() - HISTORY_DAYS * DAY_MS,
    ).toISOString();
    const logins = new Set();
    let requestCount = 0;
    const name = `${repository.owner}/${repository.name}`;
    for (let page = 1; page <= MAX_CONTRIBUTOR_PAGES; page += 1) {
      const { data } = await this.request(
        `/repos/${repositoryPath(name)}/commits?sha=${encodeURIComponent(repository.headSha)}&page=${page}&limit=100`,
      );
      requestCount += 1;
      const commits = Array.isArray(data) ? data : [];
      for (const commit of commits) {
        const committedAt =
          timestamp(
            commit.commit?.committer?.date ??
              commit.commit?.author?.date ??
              commit.created,
          ) ?? "";
        if (committedAt < cutoffAt) continue;
        const login = linkedLogin(commit.author);
        if (login) logins.add(login);
      }
      if (
        commits.length < 100 ||
        commits.some((commit) => {
          const committedAt =
            timestamp(
              commit.commit?.committer?.date ??
                commit.commit?.author?.date ??
                commit.created,
            ) ?? "";
          return committedAt < cutoffAt;
        })
      ) {
        break;
      }
    }
    for (let page = 1; page <= MAX_CONTRIBUTOR_PAGES; page += 1) {
      const { data } = await this.request(
        `/repos/${repositoryPath(name)}/pulls?state=closed&page=${page}&limit=50`,
      );
      requestCount += 1;
      const pulls = Array.isArray(data) ? data : [];
      for (const pull of pulls) {
        if (!pull.merged || (timestamp(pull.merged_at) ?? "") < cutoffAt) {
          continue;
        }
        const login = linkedLogin(pull.user);
        if (login) logins.add(login);
      }
      if (pulls.length < 50) break;
    }
    const accounts = [];
    for (const login of [...logins].sort((left, right) =>
      left.localeCompare(right),
    )) {
      try {
        const { data } = await this.request(
          `/users/${encodeURIComponent(login)}`,
        );
        requestCount += 1;
        if (linkedLogin(data)) {
          accounts.push({
            provider: this.name,
            login: data.login,
            type: "User",
          });
        }
      } catch (error) {
        requestCount += 1;
        if (error?.status !== 404) throw error;
      }
    }
    return {
      accounts,
      requestCount,
      method: "commit-and-merged-pull-request-authors",
      baselineCompletedAt: context.now,
      refreshedAt: context.now,
      scan: null,
    };
  }

  async readRootReadme(input) {
    const root = repositoryPath(input.repository);
    const { data } = await this.request(
      `/repos/${root}/contents?ref=${encodeURIComponent(input.ref)}`,
    );
    const readme = (Array.isArray(data) ? data : []).find(
      (entry) =>
        entry.type === "file" &&
        /^readme(?:\.[a-z0-9]+)?$/iu.test(entry.name ?? entry.path),
    );
    if (!readme) return null;
    const response = await this.request(
      `/repos/${root}/contents/${encodeURIComponent(readme.path)}?ref=${encodeURIComponent(input.ref)}`,
    );
    return response.data;
  }
}
