import { expect, test } from "vitest";

import * as refreshModule from "../../scripts/catalog/refresh-github.mjs";

const prior = {
  schema_version: 1,
  project_id: "fixture",
  repository: {
    id: 42,
    owner: "Creator",
    name: "Project",
    url: "https://github.com/Creator/Project",
    default_branch: "main",
    head_sha: "a".repeat(40),
    archived: false,
    created_at: "2026-01-01T00:00:00Z",
    size_kb: 10,
  },
  source_health: "healthy",
  activity: {
    latest_meaningful_commit_at: "2026-07-20T00:00:00.000Z",
    weekly_meaningful_commits: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    active_weeks_12: 1,
    strength: 100,
    dormant: false,
    latest_release_at: null,
  },
  community: {
    stargazers_count: 3,
    forks_count: 2,
    subscribers_count: 1,
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

function recoveryFunctions() {
  return refreshModule as typeof refreshModule & {
    snapshotForFailure?: (
      previous: typeof prior,
      error: { status?: number; rateLimited?: boolean },
      now: string,
    ) => typeof prior;
    identityChangeSnapshot?: (input: {
      record: {
        id: string;
        source: { repository_id: number };
      };
      repository: {
        id: number;
        owner: { login: string };
        name: string;
        html_url: string;
        default_branch: string;
        archived: boolean;
        created_at: string;
        size: number;
        stargazers_count: number;
        forks_count: number;
        subscribers_count: number;
      };
      previous: typeof prior;
      now: string;
    }) => typeof prior;
  };
}

test("rate limits preserve last-known-good facts and start staleness", () => {
  const snapshotForFailure = recoveryFunctions().snapshotForFailure;
  expect(snapshotForFailure).toBeTypeOf("function");
  if (!snapshotForFailure) return;

  const recovered = snapshotForFailure(
    prior,
    { status: 403, rateLimited: true },
    "2026-07-24T00:00:00.000Z",
  );

  expect(recovered).toEqual({
    ...prior,
    stale_since: "2026-07-24T00:00:00.000Z",
  });
  expect(prior.stale_since).toBeNull();
});

test("an unavailable repository preserves facts but marks source health", () => {
  const snapshotForFailure = recoveryFunctions().snapshotForFailure;
  expect(snapshotForFailure).toBeTypeOf("function");
  if (!snapshotForFailure) return;

  expect(
    snapshotForFailure(prior, { status: 404 }, "2026-07-24T00:00:00.000Z"),
  ).toEqual({
    ...prior,
    source_health: "unavailable",
    stale_since: "2026-07-24T00:00:00.000Z",
  });
});

test("a repository ID mismatch quarantines the source without mutating curated input", () => {
  const identityChangeSnapshot = recoveryFunctions().identityChangeSnapshot;
  expect(identityChangeSnapshot).toBeTypeOf("function");
  if (!identityChangeSnapshot) return;

  const record = {
    id: "fixture",
    source: { repository_id: 42 },
  };
  const recordBefore = structuredClone(record);
  const quarantined = identityChangeSnapshot({
    record,
    repository: {
      id: 99,
      owner: { login: "Other" },
      name: "Replacement",
      html_url: "https://github.com/Other/Replacement",
      default_branch: "main",
      archived: false,
      created_at: "2026-07-01T00:00:00Z",
      size: 20,
      stargazers_count: 10,
      forks_count: 2,
      subscribers_count: 1,
    },
    previous: prior,
    now: "2026-07-24T00:00:00.000Z",
  });

  expect(quarantined.source_health).toBe("identity-change");
  expect(quarantined.repository.id).toBe(99);
  expect(quarantined.activity).toEqual(prior.activity);
  expect(quarantined.license).toEqual(prior.license);
  expect(quarantined.stale_since).toBe("2026-07-24T00:00:00.000Z");
  expect(record).toEqual(recordBefore);
});
