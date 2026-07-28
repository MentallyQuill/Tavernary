import { expect, test } from "vitest";

import {
  contributorSnapshotForFailure,
  contributorSnapshotForSuccess,
  repositoryIdentityChanged,
  snapshotForFailure,
} from "../../scripts/catalog/refresh-github.mjs";
import { refreshKitReactions } from "../../scripts/kits/refresh-reactions.mjs";

const prior = {
  schema_version: 3,
  provider: "github",
  project_id: "fixture",
  repository: {
    id: 42,
    owner: "Creator",
    name: "Project",
    url: "https://github.com/Creator/Project",
    default_branch: "main",
    head_sha: "a".repeat(40),
    head_committed_at: "2026-07-20T00:00:00.000Z",
    archived: false,
    created_at: "2026-01-01T00:00:00.000Z",
    size_kb: 10,
  },
  source_health: "healthy",
  activity: {
    latest_source_activity_at: "2026-07-20T00:00:00.000Z",
    source_weeks: [
      {
        week_start: "2026-07-20",
        latest_at: "2026-07-20T00:00:00.000Z",
        precision: "interval",
      },
    ],
    provisional_weeks: Array.from({ length: 12 }, () => false),
    latest_release_at: null,
    evidence_status: "provisional",
    baseline_completed_at: null,
    baseline_attempts: 0,
  },
  community: {
    stars_count: 3,
    forks_count: 2,
    watchers_count: 1,
    aggregate: 6,
  },
  license: {
    status: "osi-approved",
    spdx_id: "MIT",
    source_path: "LICENSE",
  },
  refreshed_at: "2026-07-20T00:00:00.000Z",
  stale_since: null,
};

test("soft failure preserves last-known-good facts and starts staleness", () => {
  const recovered = snapshotForFailure(
    prior,
    { status: 503 },
    "2026-07-24T00:00:00.000Z",
  );

  expect(recovered).toEqual({
    ...prior,
    activity: { ...prior.activity },
    stale_since: "2026-07-24T00:00:00.000Z",
  });
  expect(prior.stale_since).toBeNull();
});

test("unavailable sources preserve evidence while changing source health", () => {
  expect(
    snapshotForFailure(prior, { status: 404 }, "2026-07-24T00:00:00.000Z"),
  ).toMatchObject({
    source_health: "unavailable",
    activity: prior.activity,
    license: prior.license,
    stale_since: "2026-07-24T00:00:00.000Z",
  });
});

test("the third baseline failure degrades evidence and advances the queue", () => {
  const previous = {
    ...prior,
    activity: { ...prior.activity, baseline_attempts: 2 },
  };

  expect(
    snapshotForFailure(previous, {}, "2026-07-24T00:00:00.000Z", {
      baselineAttempt: true,
    }),
  ).toMatchObject({
    activity: {
      evidence_status: "degraded",
      baseline_attempts: 3,
    },
  });
});

test("repository identity checks allow unverified records and reject mismatches", () => {
  expect(
    repositoryIdentityChanged(
      { source: { repository_id: null } },
      { repository: { id: 42 } },
    ),
  ).toBe(false);
  expect(
    repositoryIdentityChanged(
      { source: { repository_id: 7 } },
      { repository: { id: 42 } },
    ),
  ).toBe(true);
});

test("records a successful contributor observation as current", () => {
  expect(
    contributorSnapshotForSuccess(
      [{ login: "Alice", type: "User" }],
      "2026-07-25T00:00:00.000Z",
      "github",
    ),
  ).toEqual({
    accounts: [{ provider: "github", login: "Alice", type: "User" }],
    method: "repository-contributors",
    baseline_completed_at: null,
    scan: null,
    refreshed_at: "2026-07-25T00:00:00.000Z",
    stale_since: null,
  });
});

test("preserves previous contributor facts and marks them stale", () => {
  const previous = {
    accounts: [{ provider: "github" as const, login: "Alice", type: "User" }],
    refreshed_at: "2026-07-24T00:00:00.000Z",
    stale_since: null,
  };

  expect(
    contributorSnapshotForFailure(previous, "2026-07-25T00:00:00.000Z"),
  ).toEqual({
    ...previous,
    stale_since: "2026-07-25T00:00:00.000Z",
  });
  expect(previous.stale_since).toBeNull();
});

test("keeps contributor facts unknown after a first request failure", () => {
  expect(
    contributorSnapshotForFailure(undefined, "2026-07-25T00:00:00.000Z"),
  ).toBeUndefined();
});

test("Kit reaction failure preserves the prior ledger as stale", async () => {
  const snapshot = {
    schema_version: 1 as const,
    kit_id: "fixture-kit",
    source_issue_number: 12,
    refreshed_at: "2026-07-20T00:00:00.000Z",
    stale_since: null,
    supporters: [],
  };
  await expect(
    refreshKitReactions({
      kits: [
        {
          id: "fixture-kit",
          status: "published",
          source_issue_number: 12,
          published_at: "2026-07-01T00:00:00.000Z",
          author: { github_user_id: 1, login: "author" },
        },
      ],
      snapshots: [snapshot],
      blockedUsers: { blocked: [] },
      fetchPage: async () => {
        throw new Error("rate limited");
      },
      now: "2026-07-24T00:00:00.000Z",
    }),
  ).resolves.toEqual([
    { ...snapshot, stale_since: "2026-07-24T00:00:00.000Z" },
  ]);
});
