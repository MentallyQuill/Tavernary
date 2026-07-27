import { expect, test } from "vitest";

import {
  fetchForkContributors,
  fetchRepositoryContributors,
} from "../../scripts/catalog/github-contributors.mjs";

function pullRequest({
  login,
  type = "User",
  mergedAt = "2026-07-26T12:00:00.000Z",
  updatedAt = "2026-07-26T12:00:00.000Z",
}: {
  login: string;
  type?: string;
  mergedAt?: string | null;
  updatedAt?: string;
}) {
  return {
    merged_at: mergedAt,
    updated_at: updatedAt,
    user: { login, type },
  };
}

test("collects every linked contributor page and deduplicates usernames", async () => {
  const calls: string[] = [];
  const result = await fetchRepositoryContributors(
    { owner: "MentallyQuill", name: "Directive" },
    {
      token: "test-token",
      fetchImpl: async (url) => {
        calls.push(String(url));
        if (calls.length === 1) {
          return new Response(
            JSON.stringify([
              { login: "Alice", type: "User" },
              { login: "Claude", type: "User" },
            ]),
            {
              status: 200,
              headers: {
                link: '<https://api.github.com/repositories/1/contributors?per_page=2&page=2>; rel="next"',
              },
            },
          );
        }
        return new Response(
          JSON.stringify([
            { login: "alice", type: "User" },
            { login: "dependabot[bot]", type: "Bot" },
          ]),
          { status: 200 },
        );
      },
      perPage: 2,
    },
  );

  expect(calls).toHaveLength(2);
  expect(result).toEqual({
    accounts: [
      { login: "Alice", type: "User" },
      { login: "Claude", type: "User" },
      { login: "dependabot[bot]", type: "Bot" },
    ],
    requestCount: 2,
  });
});

test("rejects contributor rows without a linked GitHub identity", async () => {
  await expect(
    fetchRepositoryContributors(
      { owner: "owner", name: "repository" },
      {
        token: "test-token",
        fetchImpl: async () =>
          new Response(JSON.stringify([{ name: "Anonymous" }]), {
            status: 200,
          }),
      },
    ),
  ).rejects.toThrow("GitHub contributors returned malformed account data");
});

test("requires GitHub authentication before making a request", async () => {
  let requested = false;
  await expect(
    fetchRepositoryContributors(
      { owner: "owner", name: "repository" },
      {
        token: "",
        fetchImpl: async () => {
          requested = true;
          return new Response("[]", { status: 200 });
        },
      },
    ),
  ).rejects.toThrow("GitHub contributors authentication token is required");
  expect(requested).toBe(false);
});

test("classifies rate exhaustion as a systemic counted failure", async () => {
  let thrown: any;
  try {
    await fetchRepositoryContributors(
      { owner: "owner", name: "repository" },
      {
        token: "test-token",
        fetchImpl: async () =>
          new Response("", {
            status: 403,
            headers: { "x-ratelimit-remaining": "0" },
          }),
      },
    );
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toMatchObject({
    status: 403,
    rateLimited: true,
    systemic: true,
    requestCount: 1,
  });
});

test("reports malformed contributor payloads with consumed request count", async () => {
  let thrown: any;
  try {
    await fetchRepositoryContributors(
      { owner: "owner", name: "repository" },
      {
        token: "test-token",
        fetchImpl: async () =>
          new Response(JSON.stringify({ message: "not an array" }), {
            status: 200,
          }),
      },
    );
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toMatchObject({
    message: "GitHub contributors returned malformed JSON",
    requestCount: 1,
  });
});

test("collects only authors of pull requests merged into a fork", async () => {
  const result = await fetchForkContributors(
    { owner: "aikohanasaki", name: "Aikobots" },
    {
      token: "test-token",
      now: "2026-07-27T00:00:00.000Z",
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            pullRequest({ login: "aikohanasaki" }),
            pullRequest({ login: "LeRobber" }),
            pullRequest({ login: "Cohee1207", mergedAt: null }),
            pullRequest({ login: "dependabot[bot]", type: "Bot" }),
            pullRequest({ login: "lerobber" }),
          ]),
          { status: 200 },
        ),
    },
  );

  expect(result).toEqual({
    accounts: [
      { login: "aikohanasaki", type: "User" },
      { login: "LeRobber", type: "User" },
      { login: "dependabot[bot]", type: "Bot" },
    ],
    requestCount: 1,
    baselineCompletedAt: "2026-07-27T00:00:00.000Z",
    refreshedAt: "2026-07-27T00:00:00.000Z",
    scan: null,
  });
});

test("bounds a fork baseline to two pages and resumes its continuation", async () => {
  const calls: string[] = [];
  const first = await fetchForkContributors(
    { owner: "owner", name: "fork" },
    {
      token: "test-token",
      now: "2026-07-27T00:00:00.000Z",
      fetchImpl: async (url) => {
        calls.push(String(url));
        const page = calls.length;
        return new Response(
          JSON.stringify([pullRequest({ login: `Author${page}` })]),
          {
            status: 200,
            headers: {
              link: `<https://api.github.com/repos/owner/fork/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page + 1}>; rel="next"`,
            },
          },
        );
      },
    },
  );

  expect(calls).toHaveLength(2);
  expect(first.scan).toEqual({
    nextPage: 3,
    cutoffAt: null,
    targetWatermark: "2026-07-27T00:00:00.000Z",
  });
  expect(first.baselineCompletedAt).toBeNull();

  const resumedUrls: string[] = [];
  const resumed = await fetchForkContributors(
    { owner: "owner", name: "fork" },
    {
      token: "test-token",
      now: "2026-07-28T00:00:00.000Z",
      previous: first,
      fetchImpl: async (url) => {
        resumedUrls.push(String(url));
        return new Response(
          JSON.stringify([pullRequest({ login: "Author3" })]),
          { status: 200 },
        );
      },
    },
  );

  expect(resumedUrls[0]).toContain("page=3");
  expect(resumed.accounts.map(({ login }) => login)).toEqual([
    "Author1",
    "Author2",
    "Author3",
  ]);
  expect(resumed.baselineCompletedAt).toBe("2026-07-27T00:00:00.000Z");
  expect(resumed.refreshedAt).toBe("2026-07-27T00:00:00.000Z");
  expect(resumed.scan).toBeNull();
});

test("incremental fork collection stops at its prior watermark", async () => {
  const result = await fetchForkContributors(
    { owner: "owner", name: "fork" },
    {
      token: "test-token",
      now: "2026-07-28T00:00:00.000Z",
      previous: {
        accounts: [{ login: "Historical", type: "User" }],
        baselineCompletedAt: "2026-07-26T00:00:00.000Z",
        refreshedAt: "2026-07-27T00:00:00.000Z",
        scan: null,
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            pullRequest({
              login: "NewAuthor",
              updatedAt: "2026-07-27T12:00:00.000Z",
            }),
            pullRequest({
              login: "AlreadyScanned",
              updatedAt: "2026-07-27T00:00:00.000Z",
            }),
          ]),
          {
            status: 200,
            headers: {
              link: '<https://api.github.com/repos/owner/fork/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=2>; rel="next"',
            },
          },
        ),
    },
  );

  expect(result.accounts.map(({ login }) => login)).toEqual([
    "Historical",
    "NewAuthor",
  ]);
  expect(result.refreshedAt).toBe("2026-07-28T00:00:00.000Z");
  expect(result.scan).toBeNull();
  expect(result.requestCount).toBe(1);
});

test("rejects unsafe fork pull-request pagination", async () => {
  let thrown: any;
  try {
    await fetchForkContributors(
      { owner: "owner", name: "fork" },
      {
        token: "test-token",
        now: "2026-07-27T00:00:00.000Z",
        fetchImpl: async () =>
          new Response(JSON.stringify([pullRequest({ login: "Author" })]), {
            status: 200,
            headers: {
              link: '<https://example.com/steal-token?page=2>; rel="next"',
            },
          }),
      },
    );
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toMatchObject({
    message: "GitHub fork contributors returned unsafe pagination",
    requestCount: 1,
  });
});
