import { expect, test, vi } from "vitest";

import { loadEnrichmentSource } from "../../scripts/catalog/enrichment-source.mjs";

const githubRecord = {
  id: "fixture",
  source: {
    type: "github",
    repository: "Creator/Project",
    repository_id: 42,
  },
};

const codebergRecord = {
  id: "targren-lumiverse-swipescrubber",
  source: {
    type: "codeberg",
    repository: "targren/Lumiverse-SwipeScrubber",
    repository_id: 1699613,
  },
};

const redditRecord = {
  id: "reddit-1v64r6z",
  source: {
    type: "url",
    url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update/",
  },
};

const snapshot = { project_id: "fixture" };

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
    loadEnrichmentSource(githubRecord, snapshot, { loadRepository }),
  ).resolves.toMatchObject({
    sourceKind: "readme",
    sourceIdentity: "github:creator/project",
  });
});

test("retains GitHub identity on source failures", async () => {
  const loadRepository = vi.fn(async () => ({
    status: "failed" as const,
    reasonCode: "readme-rate-limited" as const,
    message: "GitHub README request was rate limited.",
  }));

  await expect(
    loadEnrichmentSource(githubRecord, snapshot, { loadRepository }),
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
    loadEnrichmentSource(codebergRecord, snapshot, { loadRepository }),
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
    loadEnrichmentSource(redditRecord, undefined, { loadReddit }),
  ).resolves.toMatchObject({ sourceKind: "reddit-body" });
});

test("fails closed for an unregistered source", async () => {
  await expect(
    loadEnrichmentSource(
      {
        ...redditRecord,
        source: { type: "url", url: "https://example.com/preset" },
      },
      undefined,
    ),
  ).resolves.toMatchObject({
    status: "failed",
    reasonCode: "unsupported-enrichment-source",
  });
});
