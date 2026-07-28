import { expect, test, vi } from "vitest";

import {
  githubReactionUrl,
  refreshKitReactions,
} from "../../scripts/kits/refresh-reactions.mjs";
import { effectiveVoteAt } from "../../scripts/kits/trending.mjs";

const now = "2026-07-24T18:00:00.000Z";
const kit = {
  id: "story-kit-241",
  status: "published",
  source_issue_number: 241,
  published_at: "2026-07-10T00:00:00.000Z",
  author: { github_user_id: 42, login: "author" },
};
const prior = {
  schema_version: 1 as const,
  kit_id: kit.id,
  source_issue_number: 241,
  refreshed_at: "2026-07-20T00:00:00.000Z",
  stale_since: null,
  supporters: [
    {
      github_user_id: 7,
      login: "returning",
      first_reacted_at: "2026-07-11T00:00:00.000Z",
      active: true,
    },
    {
      github_user_id: 8,
      login: "removed",
      first_reacted_at: "2026-07-12T00:00:00.000Z",
      active: true,
    },
  ],
};

test("derives the reaction page from repository, issue, and pagination data", () => {
  expect(
    githubReactionUrl({
      repository: "fixture-owner/fixture-catalog",
      issueNumber: 241,
      page: 3,
      perPage: 100,
    }),
  ).toBe(
    "https://api.github.com/repos/fixture-owner/fixture-catalog/issues/241/reactions?per_page=100&page=3",
  );
});

test("counts only eligible +1 reactions, including the author", async () => {
  const [snapshot] = await refreshKitReactions({
    kits: [kit],
    snapshots: [],
    blockedUsers: {
      blocked: [{ github_user_id: 99, login: "blocked", reason: "Abuse" }],
    },
    now,
    fetchPage: vi.fn().mockResolvedValue([
      {
        content: "+1",
        created_at: "2026-07-01T00:00:00.000Z",
        user: { id: 42, login: "author", type: "User" },
      },
      {
        content: "heart",
        created_at: now,
        user: { id: 50, login: "heart", type: "User" },
      },
      {
        content: "+1",
        created_at: now,
        user: { id: 99, login: "blocked", type: "User" },
      },
      {
        content: "+1",
        created_at: now,
        user: { id: 100, login: "robot", type: "Bot" },
      },
    ]),
  });

  expect(snapshot.supporters).toEqual([
    {
      github_user_id: 42,
      login: "author",
      first_reacted_at: "2026-07-01T00:00:00.000Z",
      active: true,
    },
  ]);
  expect(
    effectiveVoteAt(snapshot.supporters[0].first_reacted_at, kit.published_at),
  ).toBe(kit.published_at);
});

test("paginates, deduplicates numeric IDs, and retains ledger history", async () => {
  const pageOne = Array.from({ length: 100 }, () => ({
    content: "+1",
    created_at: "2026-07-23T00:00:00.000Z",
    user: { id: 7, login: "new-login", type: "User" },
  }));
  const fetchPage = vi
    .fn()
    .mockResolvedValueOnce(pageOne)
    .mockResolvedValueOnce([
      {
        content: "+1",
        created_at: "2026-07-24T00:00:00.000Z",
        user: { id: 9, login: "new", type: "User" },
      },
    ]);

  const [snapshot] = await refreshKitReactions({
    kits: [kit],
    snapshots: [prior],
    blockedUsers: { blocked: [] },
    fetchPage,
    now,
  });

  expect(fetchPage).toHaveBeenCalledTimes(2);
  expect(snapshot.supporters).toEqual([
    {
      github_user_id: 7,
      login: "new-login",
      first_reacted_at: "2026-07-11T00:00:00.000Z",
      active: true,
    },
    {
      github_user_id: 8,
      login: "removed",
      first_reacted_at: "2026-07-12T00:00:00.000Z",
      active: false,
    },
    {
      github_user_id: 9,
      login: "new",
      first_reacted_at: "2026-07-24T00:00:00.000Z",
      active: true,
    },
  ]);
});

test("returns a stale prior snapshot on failure and no first snapshot", async () => {
  const failing = vi.fn().mockRejectedValue(new Error("transient"));
  await expect(
    refreshKitReactions({
      kits: [kit],
      snapshots: [prior],
      blockedUsers: { blocked: [] },
      fetchPage: failing,
      now,
    }),
  ).resolves.toEqual([{ ...prior, stale_since: now }]);
  await expect(
    refreshKitReactions({
      kits: [kit],
      snapshots: [],
      blockedUsers: { blocked: [] },
      fetchPage: failing,
      now,
    }),
  ).resolves.toEqual([]);
});

test("fails edited Kit initialization by canonical ID", async () => {
  const editedKit = {
    ...kit,
    id: "super-awesome-test-kit-109",
    source_issue_number: 109,
  };

  await expect(
    refreshKitReactions({
      kits: [editedKit],
      snapshots: [],
      blockedUsers: { blocked: [] },
      fetchPage: vi.fn().mockRejectedValue(new Error("transient")),
      now,
      requiredKitId: editedKit.id,
    }),
  ).rejects.toThrow(
    "Unable to initialize Kit super-awesome-test-kit-109 support",
  );
});

test("re-added reactions keep their original first-observed timestamp", async () => {
  const inactive = {
    ...prior,
    supporters: [{ ...prior.supporters[0], active: false }],
  };
  const [snapshot] = await refreshKitReactions({
    kits: [kit],
    snapshots: [inactive],
    blockedUsers: { blocked: [] },
    now,
    fetchPage: vi.fn().mockResolvedValue([
      {
        content: "+1",
        created_at: now,
        user: { id: 7, login: "returning", type: "User" },
      },
    ]),
  });
  expect(snapshot.supporters[0].first_reacted_at).toBe(
    "2026-07-11T00:00:00.000Z",
  );
});
