import { expect, test, vi } from "vitest";

import { loadEnrichmentSource } from "../../scripts/catalog/enrichment-source.mjs";

const githubRecord = {
  id: "fixture",
  source_id: "github-42",
};
const githubSource = {
  id: "github-42",
  type: "github",
  repository: "Creator/Project",
  repository_id: 42,
};

const codebergRecord = {
  id: "targren-lumiverse-swipescrubber",
  source_id: "codeberg-1699613",
};
const codebergSource = {
  id: "codeberg-1699613",
  type: "codeberg",
  repository: "targren/Lumiverse-SwipeScrubber",
  repository_id: 1699613,
};

const redditRecord = {
  id: "reddit-1v64r6z",
  source_id: "url-reddit-1v64r6z",
};
const redditSource = {
  id: "url-reddit-1v64r6z",
  type: "url",
  url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update/",
};

const snapshot = { source_id: "github-42" };

test("routes GitHub records to the repository adapter", async () => {
  const loadRepository = vi.fn(async () => ({
    status: "ready" as const,
    sourceKind: "readme" as const,
    text: "README text",
    repositoryDescription: "Description",
    readmeText: "README text",
    repositoryId: 42,
    headSha: "a".repeat(40),
    readmePath: "README.md",
    readmeRef: "a".repeat(40),
  }));

  await expect(
    loadEnrichmentSource(githubRecord, githubSource, snapshot, {
      loadRepository,
    }),
  ).resolves.toMatchObject({
    sourceKind: "readme",
    sourceIdentity: "github:creator/project",
  });
});

test("gives sibling cards the same source evidence identity", async () => {
  const loadRepository = vi.fn(async () => ({
    status: "ready" as const,
    sourceKind: "description" as const,
    text: "Shared repository evidence",
    repositoryDescription: "Shared repository evidence",
    readmeText: null,
    repositoryId: 42,
    headSha: "a".repeat(40),
    readmePath: null,
    readmeRef: "a".repeat(40),
  }));
  const sibling = { id: "fixture-preset", source_id: githubSource.id };

  const first = await loadEnrichmentSource(
    githubRecord,
    githubSource,
    snapshot,
    { loadRepository },
  );
  const second = await loadEnrichmentSource(sibling, githubSource, snapshot, {
    loadRepository,
  });

  expect(first.sourceIdentity).toBe("github:creator/project");
  expect(second.sourceIdentity).toBe(first.sourceIdentity);
  expect(loadRepository).toHaveBeenCalledTimes(2);
  expect(loadRepository).toHaveBeenNthCalledWith(
    2,
    githubSource,
    snapshot,
    expect.any(Object),
  );
});

test("retains GitHub identity on source failures", async () => {
  const loadRepository = vi.fn(async () => ({
    status: "failed" as const,
    reasonCode: "readme-rate-limited" as const,
    message: "GitHub README request was rate limited.",
  }));

  await expect(
    loadEnrichmentSource(githubRecord, githubSource, snapshot, {
      loadRepository,
    }),
  ).resolves.toMatchObject({
    status: "failed",
    sourceIdentity: "github:creator/project",
  });
});

test("routes Codeberg records through the normalized repository adapter", async () => {
  const loadRepository = vi.fn(async () => ({
    status: "ready" as const,
    sourceKind: "readme" as const,
    text: "# Swipe Scrubber",
    repositoryDescription: null,
    readmeText: "# Swipe Scrubber",
    repositoryId: 1699613,
    headSha: "a".repeat(40),
    readmePath: "README.md",
    readmeRef: "a".repeat(40),
  }));

  await expect(
    loadEnrichmentSource(
      codebergRecord,
      codebergSource,
      { source_id: codebergSource.id },
      { loadRepository },
    ),
  ).resolves.toMatchObject({
    status: "ready",
    sourceKind: "readme",
    sourceIdentity: "codeberg:targren/lumiverse-swipescrubber",
    text: expect.stringContaining("Swipe Scrubber"),
  });
});

test("routes canonical Reddit records to the Reddit adapter", async () => {
  const loadReddit = vi.fn(async () => ({
    status: "ready" as const,
    sourceKind: "reddit-body" as const,
    sourceIdentity: "reddit:1v64r6z",
    redditPostId: "1v64r6z",
    text: "Post body",
  }));

  await expect(
    loadEnrichmentSource(redditRecord, redditSource, undefined, { loadReddit }),
  ).resolves.toMatchObject({ sourceKind: "reddit-body" });
});

test("fails closed for an unregistered source", async () => {
  await expect(
    loadEnrichmentSource(
      {
        ...redditRecord,
        source_id: "url-example-preset",
      },
      {
        id: "url-example-preset",
        type: "url",
        url: "https://example.com/preset",
      },
      undefined,
    ),
  ).resolves.toMatchObject({
    status: "failed",
    reasonCode: "unsupported-enrichment-source",
  });
});
