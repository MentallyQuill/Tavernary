import { expect, test } from "vitest";

import { createInitialRepositorySnapshot } from "../../scripts/catalog/repository-snapshot.mjs";

const observation = {
  projectId: "owner-repo",
  repository: {
    id: 42,
    owner: "Owner",
    name: "Repo",
    url: "https://github.com/Owner/Repo",
    description: "Fixture repository.",
    defaultBranch: "main",
    headSha: "a".repeat(40),
    headCommittedAt: "2026-07-25T17:00:00.000Z",
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    sizeKb: 12,
  },
  community: {
    stargazersCount: 3,
    forksCount: 2,
    subscribersCount: 1,
  },
  latestReleaseAt: "2026-07-24T00:00:00.000Z",
  coarseLicenseSpdxId: "MIT",
};

const activityInspection = {
  complete: true,
  activity: {
    evidence_head_sha: "a".repeat(40),
    latest_source_activity_at: "2026-07-25T17:00:00.000Z",
    source_weeks: [
      {
        week_start: "2026-07-20",
        latest_at: "2026-07-25T17:00:00.000Z",
        precision: "exact" as const,
      },
    ],
    provisional_weeks: null,
    latest_release_at: "2026-07-24T00:00:00.000Z",
    evidence_status: "complete" as const,
    baseline_completed_at: "2026-07-25T18:00:00.000Z",
    baseline_attempts: 0,
  },
  license: {
    status: "osi-approved" as const,
    spdxId: "MIT",
    sourcePath: "LICENSE",
  },
  requestCount: 4,
  scan: null,
};

test("creates a schema-v2 initial snapshot from API observations only", () => {
  const snapshot = createInitialRepositorySnapshot({
    projectId: "owner-repo",
    observation,
    activityInspection,
    contributors: [{ login: "owner", type: "User" }],
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(snapshot).toMatchObject({
    schema_version: 2,
    project_id: "owner-repo",
    source_health: "healthy",
    repository: {
      id: observation.repository.id,
      head_sha: observation.repository.headSha,
    },
    activity: { evidence_status: "complete" },
    contributors: {
      accounts: [{ login: "owner", type: "User" }],
      refreshed_at: "2026-07-25T18:00:00.000Z",
      stale_since: null,
    },
    stale_since: null,
  });
});

test("retains an incomplete API activity continuation as provisional", () => {
  const scan = {
    head_sha: observation.repository.headSha,
    cutoff_at: "2026-05-01T00:00:00.000Z",
    next_page: 2,
    next_index: 0,
    resolved_weeks: ["2026-07-20"],
  };
  const snapshot = createInitialRepositorySnapshot({
    projectId: "owner-repo",
    observation,
    activityInspection: {
      ...activityInspection,
      complete: false,
      scan,
    },
    contributors: [],
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(snapshot.activity.evidence_status).toBe("provisional");
  expect(snapshot.activity_scan).toEqual(scan);
});
