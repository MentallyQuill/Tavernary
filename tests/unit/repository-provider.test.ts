import { expect, test, vi } from "vitest";

import { repositoryProvider } from "../../scripts/catalog/repository-provider.mjs";

const githubRecord = {
  id: "github-example",
  type: "github" as const,
  repository: "example/project",
  repository_id: 123,
  status: "active" as const,
  refresh_policy: "automatic" as const,
};

function githubClients() {
  return {
    observeRepositories: vi.fn().mockResolvedValue({
      observations: [
        {
          sourceId: githubRecord.id,
          repository: {
            id: 123,
            owner: "example",
            name: "project",
            url: "https://github.com/example/project",
            description: "An extension.",
            defaultBranch: "main",
            headSha: "a".repeat(40),
            headCommittedAt: "2026-07-27T00:00:00.000Z",
            archived: false,
            fork: false,
            parent: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            sizeKb: 42,
          },
          community: {
            stargazersCount: 4,
            forksCount: 2,
            subscribersCount: 1,
          },
          latestReleaseAt: null,
          coarseLicenseSpdxId: "MIT",
        },
      ],
      failures: [],
      usage: { requestCount: 1, pointCost: 1, remainingPoints: 4_999 },
    }),
    inspectApiActivity: vi.fn(),
    fetchRepositoryContributors: vi.fn(),
    fetchForkContributors: vi.fn(),
    resolveRepository: vi.fn(),
    readRootReadme: vi.fn(),
  };
}

test("returns a GitHub adapter for github sources", () => {
  const provider = repositoryProvider("github", {
    github: githubClients(),
  });

  expect(provider.name).toBe("github");
  expect(provider.snapshotDirectory).toBe("data/snapshots/github");
});

test("returns a Codeberg adapter for codeberg sources", () => {
  const provider = repositoryProvider("codeberg", {
    codeberg: { request: vi.fn() },
  });

  expect(provider.name).toBe("codeberg");
  expect(provider.snapshotDirectory).toBe("data/snapshots/codeberg");
});

test("rejects an unregistered provider", () => {
  expect(() => repositoryProvider("gitlab" as never)).toThrow(
    "Unsupported repository provider: gitlab",
  );
});

test("normalizes GitHub observations behind the repository contract", async () => {
  const clients = githubClients();
  const provider = repositoryProvider("github", { github: clients });

  expect(await provider.observe([githubRecord])).toEqual({
    observations: [
      expect.objectContaining({
        provider: "github",
        sourceId: githubRecord.id,
        repository: expect.objectContaining({ id: 123 }),
        community: {
          starsCount: 4,
          forksCount: 2,
          watchersCount: 1,
        },
      }),
    ],
    failures: [],
    usage: expect.objectContaining({ requestCount: expect.any(Number) }),
  });
  expect(clients.observeRepositories).toHaveBeenCalledWith(
    [githubRecord],
    expect.objectContaining({ token: expect.any(String) }),
  );
});

test("selects the existing GitHub contributor algorithm by fork status", async () => {
  const clients = githubClients();
  clients.fetchRepositoryContributors.mockResolvedValue({
    accounts: [{ login: "owner", type: "User" }],
    requestCount: 1,
  });
  clients.fetchForkContributors.mockResolvedValue({
    accounts: [{ login: "contributor", type: "User" }],
    requestCount: 2,
    baselineCompletedAt: null,
    refreshedAt: null,
    scan: null,
  });
  const provider = repositoryProvider("github", { github: clients });
  const repository = {
    id: 123,
    owner: "example",
    name: "project",
    url: "https://github.com/example/project",
    description: null,
    defaultBranch: "main",
    headSha: "a".repeat(40),
    headCommittedAt: null,
    archived: false,
    fork: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    sizeKb: 42,
  };

  await expect(
    provider.collectContributors(repository, {
      now: "2026-07-27T00:00:00.000Z",
      previous: null,
    }),
  ).resolves.toMatchObject({ method: "repository-contributors" });
  await expect(
    provider.collectContributors(
      { ...repository, fork: true },
      {
        now: "2026-07-27T00:00:00.000Z",
        previous: null,
      },
    ),
  ).resolves.toMatchObject({ method: "merged-pull-requests" });
});
