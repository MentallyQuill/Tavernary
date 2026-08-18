import { expect, test, vi } from "vitest";

import { runRepositoryRefresh } from "../../scripts/catalog/refresh-repositories.mjs";

function record(id: string, type: "github" | "codeberg") {
  return {
    id,
    refresh_policy: "automatic",
    type,
    repository: `owner/${id}`,
    repository_id: 1,
    status: "active",
  };
}

function snapshot(id: string, provider: "github" | "codeberg") {
  return {
    schema_version: 4,
    provider,
    source_id: id,
    repository: { head_sha: "old" },
    source_health: "healthy",
    activity: {
      evidence_status: "complete",
      baseline_attempts: 0,
    },
    stale_since: null,
  };
}

test("isolates provider records, failures, and request telemetry", async () => {
  const githubSnapshot = snapshot("github-project", "github");
  const codebergSnapshot = snapshot("codeberg-project", "codeberg");
  const runGitHubRefresh = vi.fn(async ({ records }) => ({
    selected: records,
    snapshots: [{ ...githubSnapshot, repository: { head_sha: "new" } }],
    changedSnapshots: [{ ...githubSnapshot, repository: { head_sha: "new" } }],
    manifest: {
      source_timings: [
        {
          source_id: "github-project",
          outcome: "compare-source",
          duration_ms: 5,
          error_code: null,
        },
      ],
      api: {
        graphql_requests: 2,
        graphql_points: 3,
        graphql_remaining: 4_997,
        rest_requests: 1,
      },
    },
  }));
  const observe = vi.fn(async () => {
    throw Object.assign(new Error("rate limited"), { status: 429 });
  });

  const result = await runRepositoryRefresh({
    records: [
      record("github-project", "github"),
      record("codeberg-project", "codeberg"),
    ],
    snapshots: [githubSnapshot, codebergSnapshot],
    now: "2026-07-27T12:00:00.000Z",
    completedAt: "2026-07-27T12:00:01.000Z",
    runGitHubRefresh,
    providers: {
      codeberg: {
        observe,
      },
    },
    write: false,
  });

  expect(runGitHubRefresh).toHaveBeenCalledWith(
    expect.objectContaining({
      records: [expect.objectContaining({ id: "github-project" })],
      snapshots: [githubSnapshot],
    }),
  );
  expect(observe).toHaveBeenCalledWith([
    expect.objectContaining({ id: "codeberg-project" }),
  ]);
  expect(
    result.snapshots.find(({ source_id }) => source_id === "github-project")
      ?.repository.head_sha,
  ).toBe("new");
  expect(
    result.snapshots.find(({ source_id }) => source_id === "codeberg-project")
      ?.stale_since,
  ).toBe("2026-07-27T12:00:00.000Z");
  expect(result.manifest.providers).toEqual({
    github: {
      checked: 1,
      changed: 1,
      failed: 0,
      requests: 3,
      remaining: 4_997,
    },
    codeberg: {
      checked: 1,
      changed: 0,
      failed: 1,
      requests: 1,
      remaining: 0,
    },
  });
});

test("seeds schema-complete activity for a first Codeberg snapshot", async () => {
  const source = {
    ...record("codeberg-2445404", "codeberg"),
    repository: "targren/SwipeScrubber",
    repository_id: 2445404,
  };
  const headSha = "1".repeat(40);

  const result = await runRepositoryRefresh({
    mode: "project",
    sourceId: source.id,
    records: [source],
    snapshots: [],
    now: "2026-08-18T03:00:00.000Z",
    completedAt: "2026-08-18T03:00:01.000Z",
    providers: {
      codeberg: {
        observe: vi.fn(async () => ({
          observations: [
            {
              provider: "codeberg",
              sourceId: source.id,
              repository: {
                id: 2445404,
                owner: "targren",
                name: "SwipeScrubber",
                url: "https://codeberg.org/targren/SwipeScrubber",
                description: null,
                defaultBranch: "master",
                headSha,
                headCommittedAt: "2026-08-17T00:00:00.000Z",
                archived: false,
                fork: false,
                parent: null,
                createdAt: "2026-08-17T00:00:00.000Z",
                sizeKb: 1,
              },
              community: {
                starsCount: 0,
                forksCount: 0,
                watchersCount: 0,
              },
              latestReleaseAt: null,
              coarseLicenseSpdxId: null,
            },
          ],
          failures: [],
          usage: { requestCount: 1, pointCost: 0, remainingPoints: null },
        })),
        inspectActivity: vi.fn(async ({ activity }) => ({
          activity,
          license: {
            status: "osi-approved",
            spdxId: "MIT",
            sourcePath: "LICENSE.md",
          },
          requestCount: 0,
        })),
        collectContributors: vi.fn(async () => ({
          accounts: [],
          requestCount: 0,
          method: "commit-and-merged-pull-request-authors",
          baselineCompletedAt: "2026-08-18T03:00:00.000Z",
          refreshedAt: "2026-08-18T03:00:00.000Z",
          scan: null,
        })),
      },
    },
    write: false,
  });

  expect(result.snapshots).toEqual([
    expect.objectContaining({
      source_id: source.id,
      activity: expect.objectContaining({
        latest_source_activity_at: null,
        source_weeks: [],
        evidence_status: "provisional",
        baseline_completed_at: null,
        baseline_attempts: 0,
        latest_release_at: null,
        provisional_weeks: Array.from({ length: 12 }, () => false),
      }),
      license: {
        status: "osi-approved",
        spdx_id: "MIT",
        source_path: "LICENSE.md",
      },
    }),
  ]);
});

test("validates the complete source-backed catalog before publishing production refreshes", async () => {
  const sourceId = "github-1001051404";
  const publish = vi.fn(async () => undefined);
  const runGitHubRefresh = vi.fn(async ({ records, snapshots }) => ({
    selected: records,
    snapshots,
    changedSnapshots: [],
    manifest: {
      source_timings: [
        {
          source_id: sourceId,
          outcome: "unchanged",
          duration_ms: 1,
          error_code: null,
        },
      ],
      api: {
        graphql_requests: 1,
        graphql_points: 1,
        graphql_remaining: 4_999,
        rest_requests: 0,
      },
    },
  }));

  await expect(
    runRepositoryRefresh({
      mode: "project",
      sourceId,
      now: "2026-07-30T01:00:00.000Z",
      completedAt: "2026-07-30T01:00:01.000Z",
      runGitHubRefresh,
      publish,
    }),
  ).resolves.toMatchObject({
    selected: [expect.objectContaining({ id: sourceId })],
  });
  expect(publish).toHaveBeenCalledOnce();
});
