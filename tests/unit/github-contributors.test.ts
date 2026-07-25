import { expect, test } from "vitest";

import { fetchRepositoryContributors } from "../../scripts/catalog/github-contributors.mjs";

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
