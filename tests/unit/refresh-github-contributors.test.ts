import { expect, test, vi } from "vitest";

import { runRefresh } from "../../scripts/catalog/refresh-github.mjs";

const record = {
  schema_version: 4,
  id: "fixture",
  source: {
    type: "github",
    repository: "Creator/Project",
    repository_id: 42,
  },
  refresh_policy: "automatic",
  enrichment_policy: "automatic",
};

const observation = {
  projectId: record.id,
  repository: {
    id: 42,
    owner: "Creator",
    name: "Project",
    url: "https://github.com/Creator/Project",
    description: "Fixture repository.",
    defaultBranch: "main",
    headSha: "a".repeat(40),
    headCommittedAt: "2026-07-23T12:00:00.000Z",
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    sizeKb: 10,
  },
  community: {
    stargazersCount: 1,
    forksCount: 2,
    subscribersCount: 3,
  },
  latestReleaseAt: null,
  coarseLicenseSpdxId: "MIT",
};

const previousSnapshot = {
  schema_version: 2,
  project_id: record.id,
  repository: {
    id: 42,
    owner: "Creator",
    name: "Project",
    url: "https://github.com/Creator/Project",
    description: "Fixture repository.",
    default_branch: "main",
    head_sha: "a".repeat(40),
    head_committed_at: "2026-07-23T12:00:00.000Z",
    archived: false,
    created_at: "2026-01-01T00:00:00.000Z",
    size_kb: 10,
  },
  source_health: "healthy",
  activity: {
    latest_source_activity_at: "2026-07-23T12:00:00.000Z",
    source_weeks: [
      {
        week_start: "2026-07-20",
        latest_at: "2026-07-23T12:00:00.000Z",
        precision: "exact",
      },
    ],
    provisional_weeks: null,
    latest_release_at: null,
    evidence_status: "complete",
    baseline_completed_at: "2026-07-24T00:00:00.000Z",
    baseline_attempts: 0,
  },
  community: {
    stargazers_count: 1,
    forks_count: 2,
    subscribers_count: 3,
    aggregate: 6,
  },
  license: {
    status: "osi-approved",
    spdx_id: "MIT",
    source_path: "LICENSE",
  },
  contributors: {
    accounts: [{ login: "Alice", type: "User" }],
    refreshed_at: "2026-07-24T00:00:00.000Z",
    stale_since: null,
  },
  refreshed_at: "2026-07-24T00:00:00.000Z",
  stale_since: null,
};

const observe = vi.fn(async () => ({
  observations: [observation],
  failures: [],
  usage: { requestCount: 1, pointCost: 2, remainingPoints: 4_998 },
}));

test("persists contributor facts and counts their REST requests", async () => {
  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-25T00:00:00.000Z",
    records: [record],
    snapshots: [],
    observe,
    fetchContributors: async () => ({
      accounts: [
        { login: "Creator", type: "User" },
        { login: "Alice", type: "User" },
        { login: "Claude", type: "User" },
      ],
      requestCount: 2,
    }),
    inspectDelta: vi.fn(),
    inspectGit: vi.fn(),
    write: false,
  });

  expect(result.snapshots[0].contributors).toEqual({
    accounts: [
      { login: "Creator", type: "User" },
      { login: "Alice", type: "User" },
      { login: "Claude", type: "User" },
    ],
    refreshed_at: "2026-07-25T00:00:00.000Z",
    stale_since: null,
  });
  expect(result.manifest.api.rest_requests).toBe(2);
});

test("preserves prior contributor facts when a project request fails", async () => {
  const failure = Object.assign(new Error("GitHub contributors returned 404"), {
    status: 404,
    requestCount: 1,
  });
  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-25T00:00:00.000Z",
    records: [record],
    snapshots: [previousSnapshot],
    observe,
    fetchContributors: async () => {
      throw failure;
    },
    inspectDelta: vi.fn(),
    inspectGit: vi.fn(),
    write: false,
  });

  expect(result.snapshots[0].contributors).toEqual({
    ...previousSnapshot.contributors,
    stale_since: "2026-07-25T00:00:00.000Z",
  });
  expect(result.manifest.api.rest_requests).toBe(1);
});

test("aborts the refresh when contributor collection exhausts rate limits", async () => {
  const failure = Object.assign(new Error("rate limited"), {
    status: 403,
    rateLimited: true,
    systemic: true,
    requestCount: 1,
  });

  await expect(
    runRefresh({
      mode: "incremental",
      now: "2026-07-25T00:00:00.000Z",
      records: [record],
      snapshots: [previousSnapshot],
      observe,
      fetchContributors: async () => {
        throw failure;
      },
      inspectDelta: vi.fn(),
      inspectGit: vi.fn(),
      write: false,
    }),
  ).rejects.toBe(failure);
});

test("limits contributor collection to three concurrent requests", async () => {
  const records = Array.from({ length: 5 }, (_, index) => ({
    ...record,
    id: `fixture-${index}`,
    source: {
      ...record.source,
      repository: `Creator/Project-${index}`,
      repository_id: 100 + index,
    },
  }));
  const observations = records.map((entry, index) => ({
    ...observation,
    projectId: entry.id,
    repository: {
      ...observation.repository,
      id: 100 + index,
      name: `Project-${index}`,
      url: `https://github.com/Creator/Project-${index}`,
    },
  }));
  let active = 0;
  let maximumActive = 0;

  await runRefresh({
    mode: "incremental",
    now: "2026-07-25T00:00:00.000Z",
    records,
    snapshots: [],
    observe: async () => ({
      observations,
      failures: [],
      usage: { requestCount: 1, pointCost: 6, remainingPoints: 4_994 },
    }),
    fetchContributors: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { accounts: [], requestCount: 1 };
    },
    inspectDelta: vi.fn(),
    inspectGit: vi.fn(),
    write: false,
  });

  expect(maximumActive).toBe(3);
});
