import { expect, test, vi } from "vitest";

import {
  inspectDelta,
  inspectGitBaseline,
  mapConcurrent,
} from "../../scripts/catalog/github-inspector.mjs";

function provisionalActivity() {
  return {
    latest_source_activity_at: null,
    source_weeks: [],
    provisional_weeks: Array.from({ length: 12 }, () => false),
    latest_release_at: null,
    evidence_status: "provisional" as const,
    baseline_completed_at: null,
    baseline_attempts: 0,
  };
}

function commit(committedAt = "2026-07-23T04:00:00.000Z") {
  return {
    sha: "a".repeat(40),
    commit: { committer: { date: committedAt } },
  };
}

function compare(overrides: Record<string, unknown> = {}) {
  return {
    status: "ahead",
    total_commits: 2,
    commits: [
      commit("2026-07-23T02:00:00.000Z"),
      commit("2026-07-23T04:00:00.000Z"),
    ],
    files: [{ filename: "src/index.ts" }],
    ...overrides,
  };
}

function deltaInput(overrides: Record<string, unknown> = {}) {
  return {
    repository: "example/project",
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    hoursSinceLastSuccess: 12,
    crossesAmbiguousWeeks: false,
    ...overrides,
  };
}

test("accepts a fresh bounded source delta", async () => {
  const result = await inspectDelta(deltaInput(), {
    fetchCompare: async () => compare(),
  });

  expect(result).toEqual({
    kind: "accepted-source",
    activityAt: "2026-07-23T04:00:00.000Z",
    licenseChanged: false,
    requestCount: 1,
  });
});

test("accepts excluded-only paths and detects root license candidates", async () => {
  const excluded = await inspectDelta(deltaInput(), {
    fetchCompare: async () =>
      compare({
        files: [{ filename: "README.md" }, { filename: "docs/guide.md" }],
      }),
  });
  const license = await inspectDelta(deltaInput(), {
    fetchCompare: async () =>
      compare({
        files: [{ filename: "LICENSE.md" }],
      }),
  });

  expect(excluded).toMatchObject({
    kind: "accepted-excluded",
    licenseChanged: false,
  });
  expect(license).toMatchObject({
    kind: "accepted-excluded",
    licenseChanged: true,
  });
});

test.each([
  ["history-not-ahead", compare({ status: "diverged" }), {}],
  ["commit-limit", compare({ total_commits: 251 }), {}],
  [
    "file-limit",
    compare({
      files: Array.from({ length: 300 }, (_, index) => ({
        filename: `src/${index}.ts`,
      })),
    }),
    {},
  ],
  ["stale-observation", compare(), { hoursSinceLastSuccess: 49 }],
  ["multiweek", compare(), { crossesAmbiguousWeeks: true }],
])("falls back for %s", async (reason, response, input) => {
  const result = await inspectDelta(deltaInput(input), {
    fetchCompare: async () => response,
  });
  expect(result).toEqual({
    kind: "fallback",
    reason,
    requestCount: 1,
  });
});

test("falls back for compare 404 and malformed commit dates", async () => {
  const unavailable = await inspectDelta(deltaInput(), {
    fetchCompare: async () => {
      throw Object.assign(new Error("missing"), { status: 404 });
    },
  });
  const malformed = await inspectDelta(deltaInput(), {
    fetchCompare: async () =>
      compare({ commits: [commit("not-a-date"), commit()] }),
  });

  expect(unavailable).toEqual({
    kind: "fallback",
    reason: "compare-unavailable",
    requestCount: 1,
  });
  expect(malformed).toEqual({
    kind: "fallback",
    reason: "malformed-compare",
    requestCount: 1,
  });
});

test("falls back for an ahead comparison with no represented commits", async () => {
  const result = await inspectDelta(deltaInput(), {
    fetchCompare: async () =>
      compare({
        total_commits: 0,
        commits: [],
      }),
  });

  expect(result).toEqual({
    kind: "fallback",
    reason: "malformed-compare",
    requestCount: 1,
  });
});

test("retries retryable compare failures serially and counts requests", async () => {
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  const result = await inspectDelta(deltaInput(), {
    maxRetries: 1,
    fetchCompare: async () => {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      if (calls === 1) {
        throw Object.assign(new Error("upstream"), { status: 503 });
      }
      return compare();
    },
  });

  expect(result).toMatchObject({ kind: "accepted-source", requestCount: 2 });
  expect(maximumActive).toBe(1);
});

test("uses a 100-day shallow boundary and returns exact weekly evidence", async () => {
  const calls: Array<{
    cwd: string;
    args: string[];
    options: Record<string, unknown>;
  }> = [];
  const cleanup = vi.fn(async () => {});
  const result = await inspectGitBaseline(
    {
      repository: "example/project",
      defaultBranch: "main",
      now: "2026-07-24T00:00:00.000Z",
      activity: provisionalActivity(),
    },
    {
      makeTemporaryRoot: async () => "C:\\temp\\bounded-inspection",
      cleanup,
      runGit: async (cwd, args, options) => {
        calls.push({ cwd, args, options });
        if (args[0] === "log") {
          return [
            `--TAVERNARY--${"a".repeat(40)}\t2026-07-22T00:00:00.000Z\t`,
            "src/index.ts",
            `--TAVERNARY--${"b".repeat(40)}\t2026-07-08T00:00:00.000Z\t`,
            "README.md",
          ].join("\n");
        }
        if (args[0] === "ls-tree") return "LICENSE\npackage.json";
        if (args[0] === "show") {
          return "MIT License\nPermission is hereby granted, free of charge, to any person obtaining a copy";
        }
        return "";
      },
    },
  );

  const clone = calls.find(({ args }) => args[0] === "clone");
  const log = calls.find(({ args }) => args[0] === "log");
  expect(clone?.args).toContain("--shallow-since=2026-04-15T00:00:00.000Z");
  expect(log?.args).toContain("--since=2026-04-15T00:00:00.000Z");
  expect(
    calls.every(
      ({ options }) =>
        options.timeout === 300_000 &&
        options.maxBuffer === 64 * 1024 * 1024 &&
        options.windowsHide === true,
    ),
  ).toBe(true);
  expect(result.activity).toMatchObject({
    evidence_status: "complete",
    provisional_weeks: null,
    baseline_completed_at: "2026-07-24T00:00:00.000Z",
  });
  expect(result.activity.source_weeks).toEqual([
    {
      week_start: "2026-07-20",
      latest_at: "2026-07-22T00:00:00.000Z",
      precision: "exact",
    },
  ]);
  expect(result.license).toMatchObject({
    status: "osi-approved",
    spdxId: "MIT",
    sourcePath: "LICENSE",
  });
  expect(cleanup).toHaveBeenCalledWith("C:\\temp\\bounded-inspection");
});

test("cleans the temporary root when cloning times out", async () => {
  const cleanup = vi.fn(async () => {});
  await expect(
    inspectGitBaseline(
      {
        repository: "example/project",
        defaultBranch: "main",
        now: "2026-07-24T00:00:00.000Z",
        activity: provisionalActivity(),
      },
      {
        makeTemporaryRoot: async () => "C:\\temp\\timed-out-inspection",
        cleanup,
        runGit: async () => {
          throw new Error("timed out");
        },
      },
    ),
  ).rejects.toThrow("timed out");
  expect(cleanup).toHaveBeenCalledWith("C:\\temp\\timed-out-inspection");
});

test("maps Git inspections with at most three workers and stable results", async () => {
  let active = 0;
  let maximumActive = 0;
  const results = await mapConcurrent(
    Array.from({ length: 9 }, (_, index) => index),
    3,
    async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      if (value === 4) throw new Error("four");
      return value * 2;
    },
  );

  expect(maximumActive).toBe(3);
  expect(results[0]).toEqual({ status: "fulfilled", value: 0 });
  expect(results[4]).toMatchObject({ status: "rejected" });
  expect(results[8]).toEqual({ status: "fulfilled", value: 16 });
});
