import { expect, test, vi } from "vitest";

import {
  inspectApiActivity,
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

test("checkpoints a large API activity scan after its commit budget", async () => {
  const result = await inspectApiActivity(
    {
      repository: "example/project",
      expectedHeadSha: "f".repeat(40),
      now: "2026-07-24T00:00:00.000Z",
      activity: provisionalActivity(),
      scan: null,
    },
    {
      maxCommitInspections: 1,
      fetchCommitsPage: async () => [
        {
          sha: "f".repeat(40),
          committedAt: "2026-07-23T04:00:00.000Z",
          parentCount: 1,
        },
        {
          sha: "e".repeat(40),
          committedAt: "2026-07-16T03:00:00.000Z",
          parentCount: 1,
        },
      ],
      fetchCommitFiles: async () => [{ filename: "src/index.ts" }],
      fetchRootLicenses: async () => [],
    },
  );

  expect(result.complete).toBe(false);
  expect(result.scan).toMatchObject({
    head_sha: "f".repeat(40),
    next_page: 1,
    next_index: 1,
  });
  expect(result.activity).toMatchObject({
    latest_source_activity_at: "2026-07-23T04:00:00.000Z",
    evidence_status: "provisional",
  });
  expect(result.activity.source_weeks).toContainEqual({
    week_start: "2026-07-20",
    latest_at: "2026-07-23T04:00:00.000Z",
    precision: "exact",
  });
  expect(result.activity.provisional_weeks?.at(-1)).toBe(true);
});

test("downgrades complete evidence to provisional while a scan is unfinished", async () => {
  const result = await inspectApiActivity(
    {
      repository: "example/project",
      expectedHeadSha: "f".repeat(40),
      now: "2026-07-24T00:00:00.000Z",
      activity: {
        ...provisionalActivity(),
        latest_source_activity_at: "2026-07-23T04:00:00.000Z",
        source_weeks: [
          {
            week_start: "2026-07-20",
            latest_at: "2026-07-23T04:00:00.000Z",
            precision: "exact",
          },
        ],
        provisional_weeks: null,
        evidence_status: "complete",
        baseline_completed_at: "2026-07-23T08:00:00.000Z",
      },
      scan: null,
    },
    {
      maxCommitInspections: 1,
      fetchCommitsPage: async () => [
        {
          sha: "f".repeat(40),
          committedAt: "2026-07-23T04:00:00.000Z",
          parentCount: 1,
        },
        {
          sha: "e".repeat(40),
          committedAt: "2026-07-16T03:00:00.000Z",
          parentCount: 1,
        },
      ],
      fetchCommitFiles: async () => [{ filename: "README.md" }],
      fetchRootLicenses: async () => [],
    },
  );

  expect(result.complete).toBe(false);
  expect(result.activity).toMatchObject({
    evidence_status: "provisional",
    baseline_completed_at: null,
  });
  expect(result.activity.provisional_weeks?.at(-1)).toBe(true);
});

test("skips resolved weeks across full commit pages in one bounded scan", async () => {
  const pages: number[] = [];
  const result = await inspectApiActivity(
    {
      repository: "example/project",
      expectedHeadSha: "f".repeat(40),
      now: "2026-07-24T00:00:00.000Z",
      activity: provisionalActivity(),
      scan: {
        head_sha: "f".repeat(40),
        cutoff_at: "2026-04-15T00:00:00.000Z",
        next_page: 1,
        next_index: 0,
        resolved_weeks: ["2026-07-20"],
      },
    },
    {
      fetchCommitsPage: async ({ page }) => {
        pages.push(page);
        return page === 1
          ? Array.from({ length: 100 }, (_, index) => ({
              sha: index.toString(16).padStart(40, "0"),
              committedAt: "2026-07-23T04:00:00.000Z",
              parentCount: 1,
            }))
          : [];
      },
      fetchCommitFiles: async () => {
        throw new Error("resolved weeks must not fetch commit files");
      },
      fetchRootLicenses: async () => [],
    },
  );

  expect(pages).toEqual([1, 2]);
  expect(result.complete).toBe(true);
});

test("completes immediately when every activity week is already resolved", async () => {
  const result = await inspectApiActivity(
    {
      repository: "example/project",
      expectedHeadSha: "f".repeat(40),
      now: "2026-07-24T00:00:00.000Z",
      activity: provisionalActivity(),
      scan: {
        head_sha: "f".repeat(40),
        cutoff_at: "2026-04-15T00:00:00.000Z",
        next_page: 26,
        next_index: 0,
        resolved_weeks: [
          "2026-05-04",
          "2026-05-11",
          "2026-05-18",
          "2026-05-25",
          "2026-06-01",
          "2026-06-08",
          "2026-06-15",
          "2026-06-22",
          "2026-06-29",
          "2026-07-06",
          "2026-07-13",
          "2026-07-20",
        ],
      },
    },
    {
      fetchCommitsPage: async () => {
        throw new Error("fully resolved activity must not fetch more history");
      },
      fetchCommitFiles: async () => [],
      fetchRootLicenses: async () => [],
    },
  );

  expect(result.complete).toBe(true);
  expect(result.activity.evidence_head_sha).toBe("f".repeat(40));
});

test("checkpoints within a commit when changed-file pagination exceeds its budget", async () => {
  const result = await inspectApiActivity(
    {
      repository: "example/project",
      expectedHeadSha: "f".repeat(40),
      now: "2026-07-24T00:00:00.000Z",
      activity: provisionalActivity(),
      scan: null,
    },
    {
      fetchCommitsPage: async () => [
        {
          sha: "f".repeat(40),
          committedAt: "2026-07-23T04:00:00.000Z",
          parentCount: 1,
        },
      ],
      fetchCommitFiles: async ({ startPage }) => {
        expect(startPage).toBe(1);
        return {
          files: [{ filename: "src/index.ts", patch: "+   " }],
          nextPage: 4,
        };
      },
      fetchRootLicenses: async () => [],
    },
  );

  expect(result.complete).toBe(false);
  expect(result.scan).toMatchObject({
    next_page: 1,
    next_index: 0,
    pending_commit: {
      sha: "f".repeat(40),
      committed_at: "2026-07-23T04:00:00.000Z",
      parent_count: 1,
      next_file_page: 4,
      source_path_seen: true,
      substantive_patch_seen: false,
      patch_incomplete: false,
    },
  });
});

test("combines source-path and substantive-patch evidence across file pages", async () => {
  const result = await inspectApiActivity(
    {
      repository: "example/project",
      expectedHeadSha: "f".repeat(40),
      now: "2026-07-24T00:00:00.000Z",
      activity: provisionalActivity(),
      scan: {
        head_sha: "f".repeat(40),
        cutoff_at: "2026-04-15T00:00:00.000Z",
        next_page: 1,
        next_index: 0,
        resolved_weeks: [],
        pending_commit: {
          sha: "f".repeat(40),
          committed_at: "2026-07-23T04:00:00.000Z",
          parent_count: 1,
          next_file_page: 4,
          source_path_seen: true,
          substantive_patch_seen: false,
          patch_incomplete: false,
        },
      },
    },
    {
      fetchCommitsPage: async () => [
        {
          sha: "f".repeat(40),
          committedAt: "2026-07-23T04:00:00.000Z",
          parentCount: 1,
        },
      ],
      fetchCommitFiles: async ({ startPage }) => {
        expect(startPage).toBe(4);
        return {
          files: [{ filename: "README.md", patch: "+Substantive docs" }],
          nextPage: null,
        };
      },
      fetchRootLicenses: async () => [],
    },
  );

  expect(result.complete).toBe(true);
  expect(result.activity.source_weeks).toContainEqual({
    week_start: "2026-07-20",
    latest_at: "2026-07-23T04:00:00.000Z",
    precision: "exact",
  });
});

test("resumes an API scan and completes license evidence at the frozen head", async () => {
  const result = await inspectApiActivity(
    {
      repository: "example/project",
      expectedHeadSha: "a".repeat(40),
      now: "2026-07-24T00:00:00.000Z",
      activity: {
        ...provisionalActivity(),
        latest_source_activity_at: "2026-07-23T04:00:00.000Z",
        source_weeks: [
          {
            week_start: "2026-07-20",
            latest_at: "2026-07-23T04:00:00.000Z",
            precision: "exact",
          },
        ],
      },
      scan: {
        head_sha: "f".repeat(40),
        cutoff_at: "2026-04-15T00:00:00.000Z",
        next_page: 1,
        next_index: 1,
        resolved_weeks: ["2026-07-20"],
      },
    },
    {
      fetchCommitsPage: async ({ headSha }) => {
        expect(headSha).toBe("f".repeat(40));
        return [
          {
            sha: "f".repeat(40),
            committedAt: "2026-07-23T04:00:00.000Z",
            parentCount: 1,
          },
          {
            sha: "e".repeat(40),
            committedAt: "2026-07-16T03:00:00.000Z",
            parentCount: 1,
          },
        ];
      },
      fetchCommitFiles: async () => [{ filename: "README.md" }],
      fetchRootLicenses: async ({ headSha }) => {
        expect(headSha).toBe("f".repeat(40));
        return [
          {
            path: "LICENSE",
            content:
              "Permission is hereby granted, free of charge, to any person obtaining a copy",
          },
        ];
      },
    },
  );

  expect(result.complete).toBe(true);
  expect(result.scan).toBeNull();
  expect(result.activity).toMatchObject({
    evidence_status: "complete",
    evidence_head_sha: "f".repeat(40),
    provisional_weeks: null,
    baseline_completed_at: "2026-07-24T00:00:00.000Z",
  });
  expect(result.license).toMatchObject({
    status: "osi-approved",
    spdxId: "MIT",
    sourcePath: "LICENSE",
  });
});

test("uses the bounded GitHub REST client when scan fetchers are not injected", async () => {
  const requested: string[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("/commits?")) {
        return new Response(
          JSON.stringify([
            {
              sha: "f".repeat(40),
              commit: { committer: { date: "2026-07-23T04:00:00.000Z" } },
              parents: [{ sha: "e".repeat(40) }],
            },
          ]),
        );
      }
      if (url.endsWith(`/commits/${"f".repeat(40)}?per_page=100&page=1`)) {
        return new Response(
          JSON.stringify({
            files: [
              { filename: "src/index.ts", patch: "+export const x = 1;" },
            ],
          }),
        );
      }
      if (url.includes("/contents?ref=")) {
        return new Response(
          JSON.stringify([
            {
              name: "LICENSE",
              path: "LICENSE",
              type: "file",
              url: "https://api.github.com/license-content",
            },
            {
              name: "COPYING",
              path: "COPYING",
              type: "file",
              url: "https://api.github.com/unused-license-content",
            },
          ]),
        );
      }
      if (url === "https://api.github.com/license-content") {
        expect(init?.headers).toMatchObject({
          Accept: "application/vnd.github.raw+json",
        });
        return new Response(
          "Permission is hereby granted, free of charge, to any person obtaining a copy",
        );
      }
      return new Response("not found", { status: 404 });
    },
  );

  const result = await inspectApiActivity(
    {
      repository: "example/project",
      expectedHeadSha: "f".repeat(40),
      now: "2026-07-24T00:00:00.000Z",
      activity: provisionalActivity(),
      scan: null,
    },
    { token: "test-token", fetchImpl },
  );

  expect(result.complete).toBe(true);
  expect(result.activity.latest_source_activity_at).toBe(
    "2026-07-23T04:00:00.000Z",
  );
  expect(result.license?.spdxId).toBe("MIT");
  expect(result.requestCount).toBe(4);
  expect(requested).toHaveLength(4);
});

test("marks headerless GitHub secondary rate limits as systemic", async () => {
  await expect(
    inspectApiActivity(
      {
        repository: "example/project",
        expectedHeadSha: "f".repeat(40),
        now: "2026-07-24T00:00:00.000Z",
        activity: provisionalActivity(),
        scan: null,
      },
      {
        token: "test-token",
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              message:
                "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
            }),
            { status: 403 },
          ),
      },
    ),
  ).rejects.toMatchObject({
    status: 403,
    rateLimited: true,
    systemic: true,
  });
});

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

test("does not count whitespace-only source patches as activity", async () => {
  const result = await inspectDelta(deltaInput(), {
    fetchCompare: async () =>
      compare({
        files: [
          {
            filename: "src/index.ts",
            patch: "@@ -1 +1 @@\n-   \n+\t\n",
          },
        ],
      }),
  });

  expect(result).toMatchObject({ kind: "accepted-excluded" });
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

test("honors compare rate-limit delays before retrying", async () => {
  let calls = 0;
  const delay = vi.fn(async () => {});
  const result = await inspectDelta(deltaInput(), {
    maxRetries: 1,
    delay,
    fetchCompare: async () => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error("rate limited"), {
          status: 403,
          rateLimited: true,
          retryAfterMs: 250,
        });
      }
      return compare();
    },
  });

  expect(delay).toHaveBeenCalledWith(250);
  expect(result).toMatchObject({ kind: "accepted-source", requestCount: 2 });
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
      expectedHeadSha: "c".repeat(40),
      headCommittedAt: "2026-07-23T00:00:00.000Z",
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
        if (args[0] === "rev-parse") return "c".repeat(40);
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

test("uses a depth-one baseline when the observed head predates the window", async () => {
  const calls: string[][] = [];
  const result = await inspectGitBaseline(
    {
      repository: "example/dormant",
      defaultBranch: "main",
      expectedHeadSha: "d".repeat(40),
      headCommittedAt: "2025-01-01T00:00:00.000Z",
      now: "2026-07-24T00:00:00.000Z",
      activity: provisionalActivity(),
    },
    {
      makeTemporaryRoot: async () => "C:\\temp\\dormant-inspection",
      cleanup: async () => {},
      runGit: async (_cwd, args) => {
        calls.push(args);
        if (args[0] === "rev-parse") return "d".repeat(40);
        return "";
      },
    },
  );

  const clone = calls.find(([command]) => command === "clone");
  expect(clone).toContain("--depth=1");
  expect(
    clone?.some((argument) => argument.startsWith("--shallow-since")),
  ).toBe(false);
  expect(result.activity).toMatchObject({
    evidence_status: "complete",
    latest_source_activity_at: null,
    source_weeks: [],
  });
});

test("rejects a clone whose branch advanced after observation", async () => {
  await expect(
    inspectGitBaseline(
      {
        repository: "example/project",
        defaultBranch: "main",
        expectedHeadSha: "a".repeat(40),
        headCommittedAt: "2026-07-23T00:00:00.000Z",
        now: "2026-07-24T00:00:00.000Z",
        activity: provisionalActivity(),
      },
      {
        makeTemporaryRoot: async () => "C:\\temp\\advanced-inspection",
        cleanup: async () => {},
        runGit: async (_cwd, args) =>
          args[0] === "rev-parse" ? "b".repeat(40) : "",
      },
    ),
  ).rejects.toThrow("advanced after observation");
});

test("cleans the temporary root when cloning times out", async () => {
  const cleanup = vi.fn(async () => {});
  await expect(
    inspectGitBaseline(
      {
        repository: "example/project",
        defaultBranch: "main",
        expectedHeadSha: "a".repeat(40),
        headCommittedAt: "2026-07-23T00:00:00.000Z",
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
