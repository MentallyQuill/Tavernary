import { expect, test } from "vitest";

import {
  REDDIT_SOURCE_HOSTS,
  parseSourceIdentity,
  projectSubmissionTitle,
  resolveRedditShareIdentity,
  resolveSourceIdentity,
  sourceDuplicateKeys,
} from "../../scripts/submissions/source-identity.mjs";
import { safeProbe } from "../../scripts/submissions/safe-source-fetch.mjs";

test("exports the exact Reddit redirect host allowlist", () => {
  expect([...REDDIT_SOURCE_HOSTS].sort()).toEqual([
    "m.reddit.com",
    "new.reddit.com",
    "old.reddit.com",
    "redd.it",
    "reddit.com",
    "www.reddit.com",
  ]);
});

test("normalizes GitHub repository identity and title", () => {
  const identity = parseSourceIdentity(
    "https://github.com/MentallyQuill/Recursion.git/",
  );

  expect(identity).toMatchObject({
    kind: "github",
    repository: "MentallyQuill/Recursion",
    canonicalUrl: "https://github.com/MentallyQuill/Recursion",
    owner: "MentallyQuill",
    name: "Recursion",
    repositoryId: null,
  });
  expect(sourceDuplicateKeys(identity)).toEqual([
    "url:https://github.com/mentallyquill/recursion",
    "github-repository:mentallyquill/recursion",
  ]);
  expect(projectSubmissionTitle(identity)).toBe(
    "[Project submission] MentallyQuill/Recursion",
  );
});

test("uses the Reddit post ID as identity and the slug as title", () => {
  const identity = parseSourceIdentity(
    "https://old.reddit.com/r/SillyTavernAI/comments/abc123/my_new_preset/",
  );

  expect(identity).toEqual({
    kind: "reddit",
    canonicalUrl:
      "https://www.reddit.com/r/SillyTavernAI/comments/abc123/my_new_preset/",
    postId: "abc123",
    subreddit: "SillyTavernAI",
    slug: "my_new_preset",
  });
  expect(sourceDuplicateKeys(identity)).toEqual(["reddit-post:abc123"]);
  expect(projectSubmissionTitle(identity)).toBe(
    "[Project submission] r/SillyTavernAI: My New Preset",
  );
});

test.each([
  "https://reddit.com/r/SillyTavernAI/comments/abc123/title/",
  "https://www.reddit.com/r/SillyTavernAI/comments/abc123/other/",
  "https://new.reddit.com/r/SillyTavernAI/comments/abc123/title/",
  "https://m.reddit.com/r/SillyTavernAI/comments/abc123/title/",
  "https://redd.it/abc123",
])("normalizes Reddit host variants by post ID for %s", (url) => {
  expect(sourceDuplicateKeys(parseSourceIdentity(url))).toEqual([
    "reddit-post:abc123",
  ]);
});

test("resolves a Reddit share link only through trusted Reddit hosts", async () => {
  const parsed = parseSourceIdentity(
    "https://www.reddit.com/r/SillyTavernAI/s/share123",
  );

  const resolved = await resolveRedditShareIdentity(parsed, {
    probe: async (_url, options) => {
      expect(options.allowedRedirectHosts).toEqual(
        new Set([
          "reddit.com",
          "www.reddit.com",
          "old.reddit.com",
          "new.reddit.com",
          "m.reddit.com",
          "redd.it",
        ]),
      );
      return {
        finalUrl:
          "https://www.reddit.com/r/SillyTavernAI/comments/abc123/my_new_preset/",
        status: 200,
        contentType: "text/html",
        contentLength: 100,
        redirects: [
          "https://www.reddit.com/r/SillyTavernAI/comments/abc123/my_new_preset/",
        ],
      };
    },
  });

  expect(resolved).toMatchObject({
    kind: "reddit",
    postId: "abc123",
    subreddit: "SillyTavernAI",
    slug: "my_new_preset",
  });
});

test("rejects a Reddit share redirect leaving trusted hosts", async () => {
  await expect(
    resolveRedditShareIdentity(
      parseSourceIdentity("https://reddit.com/r/Test/s/share123"),
      {
        probe: (url, options) =>
          safeProbe(url, {
            ...options,
            lookup: async () => [
              { address: "93.184.216.34", family: 4 as const },
            ],
            fetchImpl: async () =>
              new Response(null, {
                status: 302,
                headers: { location: "https://evil.example/post" },
              }),
          }),
      },
    ),
  ).rejects.toMatchObject({ code: "reddit-share-unresolved" });
});

test("routes Reddit share links through general source resolution", async () => {
  const resolved = await resolveSourceIdentity(
    parseSourceIdentity("https://reddit.com/r/Test/s/share123"),
    {
      probe: async () => ({
        finalUrl: "https://redd.it/abc123",
        status: 200,
        contentType: "text/html",
        contentLength: 10,
        redirects: ["https://redd.it/abc123"],
      }),
    },
  );

  expect(resolved).toMatchObject({
    kind: "reddit",
    postId: "abc123",
  });
});

test("normalizes a generic external URL and readable issue title", () => {
  const identity = parseSourceIdentity(
    "https://Example.com:443/presets/My%20Preset/#download",
  );

  expect(identity).toEqual({
    kind: "external",
    canonicalUrl: "https://example.com/presets/My%20Preset",
    hostname: "example.com",
    pathSlug: "My Preset",
  });
  expect(sourceDuplicateKeys(identity)).toEqual([
    "url:https://example.com/presets/My%20Preset",
  ]);
  expect(projectSubmissionTitle(identity)).toBe(
    "[Project submission] example.com/My Preset",
  );
});

test("resolves permanent GitHub identity and canonical repository rename", async () => {
  const parsed = parseSourceIdentity("https://github.com/Old/Name");
  const resolved = await resolveSourceIdentity(parsed, {
    resolveGithub: async () => ({
      id: 123,
      owner: "NewOwner",
      name: "NewName",
      url: "https://github.com/NewOwner/NewName",
    }),
  });

  expect(resolved).toEqual({
    kind: "github",
    canonicalUrl: "https://github.com/NewOwner/NewName",
    repository: "NewOwner/NewName",
    repositoryId: 123,
    owner: "NewOwner",
    name: "NewName",
  });
  expect(sourceDuplicateKeys(resolved)).toContain("github-id:123");
});
