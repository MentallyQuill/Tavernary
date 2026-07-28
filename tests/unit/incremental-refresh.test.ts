import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import {
  publishCandidates,
  runRefresh,
  selectRefreshRecords,
} from "../../scripts/catalog/refresh-github.mjs";

function record(index: number) {
  return {
    schema_version: 5,
    id: `project-${String(index).padStart(3, "0")}`,
    source: {
      type: "github",
      repository: `example/project-${index}`,
      repository_id: 1_000 + index,
    },
    refresh_policy: "automatic",
    enrichment_policy: "automatic",
  };
}

function activity(
  status: "provisional" | "complete" | "degraded" = "complete",
) {
  return {
    latest_source_activity_at: "2026-07-21T12:00:00.000Z",
    source_weeks: [
      {
        week_start: "2026-07-20",
        latest_at: "2026-07-21T12:00:00.000Z",
        precision: "exact",
      },
    ],
    provisional_weeks:
      status === "complete"
        ? null
        : Array.from({ length: 12 }, (_, index) => index === 11),
    latest_release_at: null,
    evidence_status: status,
    baseline_completed_at:
      status === "complete" ? "2026-07-22T00:00:00.000Z" : null,
    baseline_attempts: 0,
  };
}

function snapshot(
  index: number,
  status: "provisional" | "complete" | "degraded" = "complete",
) {
  return {
    schema_version: 2,
    project_id: record(index).id,
    repository: {
      id: 1_000 + index,
      owner: "example",
      name: `project-${index}`,
      url: `https://github.com/example/project-${index}`,
      default_branch: "main",
      head_sha: `${index.toString(16).padStart(40, "0")}`,
      head_committed_at: "2026-07-21T12:00:00.000Z",
      archived: false,
      created_at: "2026-01-01T00:00:00.000Z",
      size_kb: 10,
    },
    source_health: "healthy",
    activity: activity(status),
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
    refreshed_at: "2026-07-22T00:00:00.000Z",
    stale_since: null,
  };
}

function observation(
  index: number,
  headSha = snapshot(index).repository.head_sha,
) {
  return {
    projectId: record(index).id,
    repository: {
      id: 1_000 + index,
      owner: "example",
      name: `project-${index}`,
      url: `https://github.com/example/project-${index}`,
      defaultBranch: "main",
      headSha,
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
}

function observer(observations: unknown[]) {
  return vi.fn(async () => ({
    observations,
    failures: [],
    usage: { requestCount: 1, pointCost: 5, remainingPoints: 4_995 },
  }));
}

test("selects baseline records from evidence status rather than index", () => {
  const records = Array.from({ length: 213 }, (_, index) => record(index));
  const snapshots = records.map((_, index) =>
    snapshot(
      index,
      index === 1
        ? "degraded"
        : [2, 200, 212].includes(index)
          ? "provisional"
          : "complete",
    ),
  );

  expect(
    selectRefreshRecords(records, snapshots, {
      mode: "baseline",
      batchSize: 2,
    }).map(({ id }) => id),
  ).toEqual([record(1).id, record(2).id]);
});

test("requires exact project modes and bounds baseline batches", () => {
  const records = [record(0), record(1)];
  const snapshots = [snapshot(0), snapshot(1)];

  expect(() =>
    selectRefreshRecords(records, snapshots, {
      mode: "project",
      projectId: record(1).id,
    }),
  ).not.toThrow();
  expect(() =>
    selectRefreshRecords(records, snapshots, { mode: "forensic" }),
  ).toThrow("project_id");
  expect(() =>
    selectRefreshRecords(records, snapshots, {
      mode: "baseline",
      batchSize: 25,
    }),
  ).toThrow("between 1 and 24");
});

test("selects one coherent project-mode batch from repeated IDs", () => {
  const records = [record(0), record(1), record(2), record(3)];
  const snapshots = records.map((_, index) => snapshot(index));

  expect(
    selectRefreshRecords(records, snapshots, {
      mode: "project",
      projectIds: [record(2).id, record(0).id, record(2).id],
    }).map(({ id }) => id),
  ).toEqual([record(0).id, record(2).id]);
  expect(() =>
    selectRefreshRecords(records, snapshots, {
      mode: "project",
      projectIds: [record(0).id, "missing-project"],
    }),
  ).toThrow("missing-project");
});

test("unchanged projects require zero compares and zero clones", async () => {
  const records = Array.from({ length: 204 }, (_, index) => record(index));
  const snapshots = records.map((_, index) => snapshot(index));
  const inspectDelta = vi.fn();
  const inspectGit = vi.fn();
  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records,
    snapshots,
    observe: observer(records.map((_, index) => observation(index))),
    inspectDelta,
    inspectGit,
    write: false,
  });

  expect(inspectDelta).not.toHaveBeenCalled();
  expect(inspectGit).not.toHaveBeenCalled();
  expect(result.manifest.counts).toMatchObject({
    total: 204,
    unchanged: 204,
  });
});

test("an injected observer does not enable contributor requests from an ambient token", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
  try {
    const result = await runRefresh({
      mode: "incremental",
      now: "2026-07-24T08:00:00.000Z",
      token: "actions-token",
      records: [record(0)],
      snapshots: [snapshot(0)],
      observe: observer([observation(0)]),
      inspectDelta: vi.fn(),
      inspectGit: vi.fn(),
      write: false,
    });

    expect(result.manifest.api.rest_requests).toBe(0);
    expect(result.snapshots[0].contributors).toBeUndefined();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("normalizes raw GitHub community metrics while retaining refresh evidence", async () => {
  const previous = {
    ...snapshot(0),
    contributors: {
      accounts: [{ provider: "github", login: "maintainer", type: "User" }],
      method: "repository-contributors",
      baseline_completed_at: "2026-07-22T00:00:00.000Z",
      scan: null,
      refreshed_at: "2026-07-22T00:00:00.000Z",
      stale_since: null,
    },
  };
  const parent = {
    id: 999,
    owner: "upstream",
    name: "project",
    url: "https://github.com/upstream/project",
  };
  const rawObservation = {
    ...observation(0),
    repository: {
      ...observation(0).repository,
      fork: true,
      parent,
    },
    community: {
      stargazersCount: 46,
      forksCount: 4,
      subscribersCount: 2,
    },
  };

  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records: [record(0)],
    snapshots: [previous],
    observe: observer([rawObservation]),
    inspectDelta: vi.fn(),
    inspectGit: vi.fn(),
    write: false,
  });

  expect(result.snapshots[0]).toMatchObject({
    repository: { fork: true, parent },
    community: {
      stars_count: 46,
      forks_count: 4,
      watchers_count: 2,
      aggregate: 52,
    },
    activity: previous.activity,
    contributors: previous.contributors,
  });
});

test("first observation creates provisional evidence without cloning", async () => {
  const inspectDelta = vi.fn();
  const inspectGit = vi.fn();
  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records: [record(0)],
    snapshots: [],
    observe: observer([observation(0)]),
    inspectDelta,
    inspectGit,
    write: false,
  });

  expect(inspectDelta).not.toHaveBeenCalled();
  expect(inspectGit).not.toHaveBeenCalled();
  expect(result.snapshots[0].activity).toMatchObject({
    evidence_status: "provisional",
    provisional_weeks: Array.from({ length: 12 }, () => false),
  });
  expect(result.manifest.counts).toMatchObject({
    changed: 1,
    provisional: 1,
  });
});

test("records changed source evidence without cloning", async () => {
  const changedHead = "f".repeat(40);
  const inspectGit = vi.fn();
  const inspectDelta = vi.fn(async () => ({
    kind: "accepted-source" as const,
    activityAt: "2026-07-23T12:00:00.000Z",
    licenseChanged: false,
    requestCount: 1,
  }));
  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records: [record(0)],
    snapshots: [snapshot(0)],
    previousManifest: {
      mode: "incremental",
      completed_at: "2026-07-23T20:00:00.000Z",
    },
    observe: observer([observation(0, changedHead)]),
    inspectDelta,
    inspectGit,
    write: false,
  });

  expect(inspectGit).not.toHaveBeenCalled();
  expect(inspectDelta).toHaveBeenCalledWith(
    expect.objectContaining({ hoursSinceLastSuccess: 12 }),
  );
  expect(result.snapshots[0].repository.head_sha).toBe(changedHead);
  expect(result.snapshots[0].activity.source_weeks[0]).toMatchObject({
    week_start: "2026-07-20",
    latest_at: "2026-07-23T12:00:00.000Z",
    precision: "exact",
  });
  expect(result.manifest.counts.compared).toBe(1);
});

test("uses no more than three concurrent Git fallbacks", async () => {
  const records = Array.from({ length: 8 }, (_, index) => record(index));
  const snapshots = records.map((_, index) => snapshot(index));
  let active = 0;
  let maximum = 0;
  const inspectGit = vi.fn(async ({ activity: priorActivity }) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return {
      activity: { ...priorActivity, evidence_status: "complete" },
      license: {
        status: "osi-approved",
        spdxId: "MIT",
        sourcePath: "LICENSE",
      },
      sourceCommitCount: 1,
      cutoffIso: "2026-04-15T08:00:00.000Z",
    };
  });
  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records,
    snapshots,
    observe: observer(
      records.map((_, index) => observation(index, "f".repeat(40))),
    ),
    inspectDelta: vi.fn(async () => ({
      kind: "fallback",
      reason: "commit-limit",
      requestCount: 1,
    })),
    inspectGit,
    write: false,
  });

  expect(maximum).toBe(3);
  expect(result.manifest.counts.fallback).toBe(8);
});

test("persists a budgeted activity scan instead of consuming its evidence head", async () => {
  const changedHead = "f".repeat(40);
  const previous = snapshot(0);
  const scan = {
    head_sha: changedHead,
    cutoff_at: "2026-04-15T08:00:00.000Z",
    next_page: 2,
    next_index: 14,
    resolved_weeks: ["2026-07-20"],
  };
  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records: [record(0)],
    snapshots: [previous],
    observe: observer([observation(0, changedHead)]),
    inspectDelta: vi.fn(async () => ({
      kind: "fallback",
      reason: "commit-limit",
      requestCount: 1,
    })),
    inspectGit: vi.fn(async ({ activity }) => ({
      complete: false,
      activity: {
        ...activity,
        evidence_status: "provisional",
        baseline_completed_at: null,
        provisional_weeks: Array.from(
          { length: 12 },
          (_, index) => index === 11,
        ),
      },
      license: null,
      requestCount: 7,
      scan,
    })),
    write: false,
  });

  expect(result.snapshots[0]).toMatchObject({
    repository: { head_sha: changedHead },
    activity: {
      evidence_status: "provisional",
      evidence_head_sha: previous.repository.head_sha,
    },
    activity_scan: scan,
  });
  expect(result.manifest.counts.failed).toBe(0);
  expect(result.manifest.api.rest_requests).toBe(8);
});

test("resumes a pending activity scan even when the observed head is unchanged", async () => {
  const changedHead = "f".repeat(40);
  const pending = {
    ...snapshot(0),
    repository: {
      ...snapshot(0).repository,
      head_sha: changedHead,
    },
    activity: {
      ...activity("provisional"),
      evidence_head_sha: snapshot(0).repository.head_sha,
    },
    activity_scan: {
      head_sha: changedHead,
      cutoff_at: "2026-04-15T08:00:00.000Z",
      next_page: 2,
      next_index: 14,
      resolved_weeks: ["2026-07-20"],
    },
  };
  const inspectGit = vi.fn(async ({ activity: priorActivity }) => ({
    complete: true,
    activity: {
      ...priorActivity,
      evidence_status: "complete",
      evidence_head_sha: changedHead,
      provisional_weeks: null,
      baseline_completed_at: "2026-07-24T08:00:00.000Z",
    },
    license: {
      status: "osi-approved",
      spdxId: "MIT",
      sourcePath: "LICENSE",
    },
    scan: null,
  }));
  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records: [record(0)],
    snapshots: [pending],
    observe: observer([observation(0, changedHead)]),
    inspectDelta: vi.fn(),
    inspectGit,
    write: false,
  });

  expect(inspectGit).toHaveBeenCalledOnce();
  expect(result.snapshots[0]).toMatchObject({
    activity: {
      evidence_status: "complete",
      evidence_head_sha: changedHead,
    },
    activity_scan: null,
  });
});

test("compares from the evidence watermark when repository observation is ahead", async () => {
  const observedHead = "f".repeat(40);
  const evidenceHead = "a".repeat(40);
  const previous = {
    ...snapshot(0),
    repository: {
      ...snapshot(0).repository,
      head_sha: observedHead,
    },
    activity: {
      ...snapshot(0).activity,
      evidence_head_sha: evidenceHead,
    },
  };
  const inspectDelta = vi.fn(async () => ({
    kind: "accepted-excluded" as const,
    licenseChanged: false,
    requestCount: 1,
  }));
  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records: [record(0)],
    snapshots: [previous],
    observe: observer([observation(0, observedHead)]),
    inspectDelta,
    inspectGit: vi.fn(),
    write: false,
  });

  expect(inspectDelta).toHaveBeenCalledWith(
    expect.objectContaining({ baseSha: evidenceHead, headSha: observedHead }),
  );
  expect(result.snapshots[0].activity.evidence_head_sha).toBe(observedHead);
});

test("forces a full scan for legacy degraded evidence without a watermark", async () => {
  const previous = snapshot(0, "degraded");
  const inspectGit = vi.fn(async ({ activity: priorActivity }) => ({
    complete: false,
    activity: {
      ...priorActivity,
      evidence_status: "provisional",
      provisional_weeks: Array.from({ length: 12 }, () => false),
      baseline_completed_at: null,
    },
    license: null,
    requestCount: 1,
    scan: {
      head_sha: previous.repository.head_sha,
      cutoff_at: "2026-04-15T08:00:00.000Z",
      next_page: 2,
      next_index: 0,
      resolved_weeks: [],
    },
  }));
  await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records: [record(0)],
    snapshots: [previous],
    observe: observer([observation(0)]),
    inspectDelta: vi.fn(),
    inspectGit,
    write: false,
  });

  expect(inspectGit).toHaveBeenCalledOnce();
  expect(inspectGit).toHaveBeenCalledWith(
    expect.objectContaining({
      activity: expect.objectContaining({ evidence_head_sha: null }),
      scan: null,
    }),
  );
});

test("preserves a pending scan cursor across a transient inspection failure", async () => {
  const changedHead = "f".repeat(40);
  const scan = {
    head_sha: changedHead,
    cutoff_at: "2026-04-15T08:00:00.000Z",
    next_page: 2,
    next_index: 14,
    resolved_weeks: ["2026-07-20"],
  };
  const pending = {
    ...snapshot(0, "provisional"),
    repository: {
      ...snapshot(0).repository,
      head_sha: changedHead,
    },
    activity_scan: scan,
  };
  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records: [record(0)],
    snapshots: [pending],
    observe: observer([observation(0, changedHead)]),
    inspectDelta: vi.fn(),
    inspectGit: vi.fn(async () => {
      throw new Error("temporary transport failure");
    }),
    write: false,
  });

  expect(result.snapshots[0].activity_scan).toEqual(scan);
  expect(result.snapshots[0].activity.evidence_status).toBe("provisional");
});

test("soft failures preserve observed facts and degrade the third failed baseline", async () => {
  const provisional = snapshot(0, "provisional");
  const previous = {
    ...provisional,
    repository: {
      ...provisional.repository,
      head_committed_at: null,
    },
    activity: {
      ...provisional.activity,
      baseline_attempts: 2,
    },
    stale_since: "2026-07-22T08:00:00.000Z",
  };
  const result = await runRefresh({
    mode: "baseline",
    now: "2026-07-24T08:00:00.000Z",
    records: [record(0)],
    snapshots: [previous],
    observe: observer([observation(0)]),
    inspectDelta: vi.fn(),
    inspectGit: vi.fn(async () => {
      throw Object.assign(new Error("clone C:\\tmp\\secret failed"), {
        code: "GIT_TIMEOUT",
      });
    }),
    write: false,
  });

  expect(result.snapshots[0].repository.head_sha).toBe(
    previous.repository.head_sha,
  );
  expect(result.snapshots[0].repository.head_committed_at).toBe(
    "2026-07-23T12:00:00.000Z",
  );
  expect(result.snapshots[0].activity).toMatchObject({
    evidence_status: "degraded",
    baseline_attempts: 3,
  });
  expect(result.snapshots[0].stale_since).toBe("2026-07-22T08:00:00.000Z");
  expect(JSON.stringify(result.manifest)).not.toContain("C:\\tmp\\secret");
});

test("systemic observation failures publish nothing", async () => {
  const publish = vi.fn();

  await expect(
    runRefresh({
      mode: "incremental",
      records: [record(0)],
      snapshots: [snapshot(0)],
      observe: vi.fn(async () => {
        throw new Error("GitHub GraphQL authentication token is required");
      }),
      inspectDelta: vi.fn(),
      inspectGit: vi.fn(),
      publish,
    }),
  ).rejects.toThrow("authentication");
  expect(publish).not.toHaveBeenCalled();
});

test("systemic REST rate exhaustion aborts candidate publication", async () => {
  const publish = vi.fn();
  const changedHead = "f".repeat(40);

  await expect(
    runRefresh({
      mode: "incremental",
      records: [record(0)],
      snapshots: [snapshot(0)],
      observe: observer([observation(0, changedHead)]),
      inspectDelta: vi.fn(async () => {
        throw Object.assign(new Error("rate budget exhausted"), {
          status: 403,
          rateLimited: true,
        });
      }),
      inspectGit: vi.fn(),
      publish,
    }),
  ).rejects.toThrow("rate budget exhausted");
  expect(publish).not.toHaveBeenCalled();
});

test("systemic REST rate exhaustion during a resumed scan aborts publication", async () => {
  const publish = vi.fn();
  const changedHead = "f".repeat(40);
  const pending = {
    ...snapshot(0, "provisional"),
    repository: {
      ...snapshot(0).repository,
      head_sha: changedHead,
    },
    activity_scan: {
      head_sha: changedHead,
      cutoff_at: "2026-04-15T08:00:00.000Z",
      next_page: 2,
      next_index: 14,
      resolved_weeks: ["2026-07-20"],
    },
  };

  await expect(
    runRefresh({
      mode: "incremental",
      records: [record(0)],
      snapshots: [pending],
      observe: observer([observation(0, changedHead)]),
      inspectDelta: vi.fn(),
      inspectGit: vi.fn(async () => {
        throw Object.assign(new Error("rate budget exhausted"), {
          status: 403,
          rateLimited: true,
          systemic: true,
        });
      }),
      publish,
    }),
  ).rejects.toThrow("rate budget exhausted");
  expect(publish).not.toHaveBeenCalled();
});

test("validates and builds all candidates before publishing once", async () => {
  const validateCandidates = vi.fn(async () => ({ errors: [] }));
  const buildCandidates = vi.fn(async () => ({ projects: [] }));
  const publish = vi.fn(async () => undefined);

  await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records: [record(0)],
    snapshots: [snapshot(0)],
    observe: observer([observation(0)]),
    inspectDelta: vi.fn(),
    inspectGit: vi.fn(),
    validateCandidates,
    buildCandidates,
    publish,
  });

  expect(validateCandidates).toHaveBeenCalledOnce();
  expect(buildCandidates).toHaveBeenCalledOnce();
  expect(publish).toHaveBeenCalledOnce();
  expect(validateCandidates.mock.invocationCallOrder[0]).toBeLessThan(
    publish.mock.invocationCallOrder[0],
  );
  expect(buildCandidates.mock.invocationCallOrder[0]).toBeLessThan(
    publish.mock.invocationCallOrder[0],
  );
});

test("rolls back installed snapshots when publication fails", async () => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "tavernary-publish-test-"),
  );
  const snapshotDirectory = join(temporaryRoot, "github");
  const manifestPath = join(temporaryRoot, "github-refresh.json");
  await mkdir(snapshotDirectory);
  const firstPath = join(snapshotDirectory, "first.json");
  const secondPath = join(snapshotDirectory, "second.json");
  await writeFile(firstPath, '{"version":"old-first"}\n');
  await writeFile(secondPath, '{"version":"old-second"}\n');
  await writeFile(manifestPath, '{"version":"old-manifest"}\n');
  let failed = false;

  try {
    await expect(
      publishCandidates(
        {
          changedSnapshots: [
            { project_id: "first", version: "new-first" },
            { project_id: "second", version: "new-second" },
          ],
          manifest: { version: "new-manifest" },
        },
        {
          snapshotDirectory,
          manifestPath,
          rename: async (from, to) => {
            if (!failed && to === secondPath) {
              failed = true;
              throw new Error("simulated publication failure");
            }
            await rename(from, to);
          },
        },
      ),
    ).rejects.toThrow("simulated publication failure");

    expect(await readFile(firstPath, "utf8")).toBe('{"version":"old-first"}\n');
    expect(await readFile(secondPath, "utf8")).toBe(
      '{"version":"old-second"}\n',
    );
    expect(await readFile(manifestPath, "utf8")).toBe(
      '{"version":"old-manifest"}\n',
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
