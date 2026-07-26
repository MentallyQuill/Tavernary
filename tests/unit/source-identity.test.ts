import { expect, test } from "vitest";

import {
  parseSourceIdentity,
  projectSubmissionTitle,
  resolveSourceIdentity,
  sourceDuplicateKeys,
} from "../../scripts/submissions/source-identity.mjs";

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
