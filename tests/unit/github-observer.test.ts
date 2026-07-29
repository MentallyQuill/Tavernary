import { describe, expect, test, vi } from "vitest";

import { observeRepositories } from "../../scripts/catalog/github-observer.mjs";

function records(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `github-${1000 + index}`,
    type: "github" as const,
    repository: `owner-${index}/repository-${index}`,
    repository_id: 1000 + index,
    status: "active" as const,
    refresh_policy: "automatic" as const,
  }));
}

function repositoryNode(
  index: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    databaseId: 1000 + index,
    name: `repository-${index}`,
    nameWithOwner: `owner-${index}/repository-${index}`,
    url: `https://github.com/owner-${index}/repository-${index}`,
    description: `Description ${index}`,
    createdAt: "2026-01-01T00:00:00Z",
    diskUsage: 100 + index,
    isArchived: false,
    isFork: false,
    forkCount: 2,
    stargazerCount: 3,
    watchers: { totalCount: 4 },
    licenseInfo: { spdxId: "MIT" },
    latestRelease: { publishedAt: "2026-07-20T00:00:00Z" },
    defaultBranchRef: {
      name: "main",
      target: {
        oid: String(index).padStart(40, "a"),
        committedDate: "2026-07-23T00:00:00Z",
      },
    },
    ...overrides,
  };
}

function batchResponse(
  start: number,
  count: number,
  overrides: Record<string, unknown> = {},
) {
  const data = Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `r${index}`,
      repositoryNode(start + index),
    ]),
  );
  return new Response(
    JSON.stringify({
      data: {
        ...data,
        rateLimit: {
          cost: count + 1,
          remaining: 4000 - start,
          resetAt: "2026-07-24T01:00:00Z",
        },
        ...overrides,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("GitHub repository observer", () => {
  test("observes a repository source and returns its stable source ID", async () => {
    const [source] = records(1);
    const result = await observeRepositories(
      [
        {
          ...source,
          status: "active",
          refresh_policy: "automatic",
        },
      ],
      {
        token: "test-token",
        fetchImpl: async () => batchResponse(0, 1),
      },
    );

    expect(result).toMatchObject({
      observations: [{ sourceId: "github-1000" }],
    });
  });

  test("observes 53 repositories in three serial variable-driven batches", async () => {
    const calls: Array<{ active: number; query: string; variables: object }> =
      [];
    let active = 0;
    let maximumActive = 0;
    let start = 0;
    const result = await observeRepositories(records(53), {
      token: "test-token",
      batchSize: 25,
      fetchImpl: async (_url, init) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const body = JSON.parse(String(init?.body));
        const count = Object.keys(body.variables).filter((key) =>
          key.startsWith("owner"),
        ).length;
        calls.push({ active, query: body.query, variables: body.variables });
        await Promise.resolve();
        const response = batchResponse(start, count);
        start += count;
        active -= 1;
        return response;
      },
    });

    expect(calls).toHaveLength(3);
    expect(maximumActive).toBe(1);
    expect(calls[0].query).toContain(
      "r0: repository(owner: $owner0, name: $name0)",
    );
    expect(calls[0].query).toMatch(/\n\s+description\n/);
    expect(calls[0].query).toMatch(/\n\s+parent \{/);
    expect(calls[0].query).not.toContain("/readme");
    expect(calls[0].query).not.toContain("owner-0");
    expect(calls[0].variables).toMatchObject({
      owner0: "owner-0",
      name0: "repository-0",
    });
    expect(result.observations).toHaveLength(53);
    expect(result.failures).toEqual([]);
    expect(result.usage).toEqual({
      requestCount: 3,
      pointCost: 56,
      remainingPoints: 3950,
    });
  });

  test("maps watcher subscribers and nullable release facts", async () => {
    const result = await observeRepositories(records(1), {
      token: "test-token",
      fetchImpl: async () =>
        batchResponse(0, 1, {
          r0: repositoryNode(0, {
            latestRelease: null,
            licenseInfo: null,
          }),
        }),
    });

    expect(result.observations[0]).toMatchObject({
      sourceId: "github-1000",
      repository: {
        id: 1000,
        description: "Description 0",
        defaultBranch: "main",
        headCommittedAt: "2026-07-23T00:00:00.000Z",
        parent: null,
      },
      community: {
        stargazersCount: 3,
        forksCount: 2,
        subscribersCount: 4,
      },
      latestReleaseAt: null,
      coarseLicenseSpdxId: null,
    });
  });

  test("observes whether a repository is a fork", async () => {
    const result = await observeRepositories(records(1), {
      token: "test-token",
      fetchImpl: async () =>
        batchResponse(0, 1, {
          r0: repositoryNode(0, { isFork: true }),
        }),
    });

    expect(result.observations[0].repository.fork).toBe(true);
  });

  test("observes the immediate parent of a fork", async () => {
    const result = await observeRepositories(records(1), {
      token: "test-token",
      fetchImpl: async () =>
        batchResponse(0, 1, {
          r0: repositoryNode(0, {
            isFork: true,
            parent: {
              databaseId: 9001,
              name: "VectHare",
              nameWithOwner: "Coneja-Chibi/VectHare",
              url: "https://github.com/Coneja-Chibi/VectHare",
            },
          }),
        }),
    });

    expect(result.observations[0].repository.parent).toEqual({
      id: 9001,
      owner: "Coneja-Chibi",
      name: "VectHare",
      url: "https://github.com/Coneja-Chibi/VectHare",
    });
  });

  test("rejects a repository that reports itself as its parent", async () => {
    await expect(
      observeRepositories(records(1), {
        token: "test-token",
        fetchImpl: async () =>
          batchResponse(0, 1, {
            r0: repositoryNode(0, {
              isFork: true,
              parent: {
                databaseId: 1000,
                name: "repository-0",
                nameWithOwner: "owner-0/repository-0",
                url: "https://github.com/owner-0/repository-0",
              },
            }),
          }),
      }),
    ).rejects.toThrow("GitHub GraphQL returned malformed repository data");
  });

  test("rejects a parent reported for a repository that is not a fork", async () => {
    await expect(
      observeRepositories(records(1), {
        token: "test-token",
        fetchImpl: async () =>
          batchResponse(0, 1, {
            r0: repositoryNode(0, {
              parent: {
                databaseId: 9001,
                name: "Parent",
                nameWithOwner: "Upstream/Parent",
                url: "https://github.com/Upstream/Parent",
              },
            }),
          }),
      }),
    ).rejects.toThrow("GitHub GraphQL returned malformed repository data");
  });

  test("preserves a nullable GitHub short description", async () => {
    const result = await observeRepositories(records(1), {
      token: "test-token",
      fetchImpl: async () =>
        batchResponse(0, 1, {
          r0: repositoryNode(0, { description: null }),
        }),
    });

    expect(result.observations[0].repository.description).toBeNull();
  });

  test("keeps alias errors, identity changes, and missing branches per project", async () => {
    const response = new Response(
      JSON.stringify({
        data: {
          r0: null,
          r1: repositoryNode(1, { databaseId: 9999 }),
          r2: repositoryNode(2, { defaultBranchRef: null }),
          rateLimit: {
            cost: 4,
            remaining: 3996,
            resetAt: "2026-07-24T01:00:00Z",
          },
        },
        errors: [
          {
            message: "Could not resolve to a Repository",
            path: ["r0"],
          },
        ],
      }),
      { status: 200 },
    );
    const result = await observeRepositories(records(3), {
      token: "test-token",
      fetchImpl: async () => response,
    });

    expect(result.observations).toEqual([]);
    expect(result.failures).toEqual([
      {
        sourceId: "github-1000",
        kind: "unavailable",
        message: "Repository is unavailable",
      },
      {
        sourceId: "github-1001",
        kind: "identity-change",
        message: "Repository identity changed",
      },
      {
        sourceId: "github-1002",
        kind: "missing-default-branch",
        message: "Repository has no default branch commit",
      },
    ]);
  });

  test.each([
    [
      "authentication",
      new Response("", { status: 401 }),
      "GitHub GraphQL authentication failed",
    ],
    [
      "malformed rate data",
      new Response(JSON.stringify({ data: { r0: repositoryNode(0) } }), {
        status: 200,
      }),
      "GitHub GraphQL returned malformed rate-limit data",
    ],
    [
      "exhausted budget",
      new Response(
        JSON.stringify({
          data: {
            r0: repositoryNode(0),
            rateLimit: {
              cost: 2,
              remaining: 0,
              resetAt: "2026-07-24T01:00:00Z",
            },
          },
        }),
        { status: 200 },
      ),
      "GitHub GraphQL rate budget is exhausted",
    ],
  ])("treats %s as a systemic failure", async (_case, response, message) => {
    await expect(
      observeRepositories(records(1), {
        token: "secret-token",
        fetchImpl: async () => response,
      }),
    ).rejects.toThrow(message);
  });

  test("honors a rate-limited 403 before retrying", async () => {
    let calls = 0;
    const result = await observeRepositories(records(1), {
      token: "secret-token",
      maxRetries: 1,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("", {
            status: 403,
            headers: {
              "retry-after": "0",
              "x-ratelimit-remaining": "0",
            },
          });
        }
        return batchResponse(0, 1);
      },
    });

    expect(calls).toBe(2);
    expect(result.observations).toHaveLength(1);
    expect(result.usage.requestCount).toBe(2);
  });

  test("bounds retryable failures and never logs or throws the token", async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    let calls = 0;
    let thrown: unknown;

    try {
      await observeRepositories(records(1), {
        token: "do-not-leak",
        maxRetries: 1,
        logger,
        fetchImpl: async () => {
          calls += 1;
          return new Response("contains do-not-leak", { status: 503 });
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(calls).toBe(2);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "GitHub GraphQL request failed with status 503",
    );
    expect((thrown as Error).message).not.toContain("do-not-leak");
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain("do-not-leak");
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  test("counts a recovered transport retry as an API request", async () => {
    let calls = 0;
    const result = await observeRepositories(records(1), {
      token: "test-token",
      maxRetries: 1,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new Error("socket closed");
        return batchResponse(0, 1);
      },
    });

    expect(result.observations).toHaveLength(1);
    expect(result.usage.requestCount).toBe(2);
  });
});
