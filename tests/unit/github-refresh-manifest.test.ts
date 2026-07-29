import { expect, test } from "vitest";

import { buildRefreshManifest } from "../../scripts/catalog/github-refresh-manifest.mjs";
import type { RefreshOutcome } from "../../scripts/catalog/github-refresh-manifest.mjs";

function outcome(
  result: RefreshOutcome,
  durationMs: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    sourceId: `source-${result}`,
    result,
    durationMs,
    snapshotChanged: result !== "unchanged",
    ...overrides,
  };
}

test("summarizes outcomes without leaking secrets or clone paths", () => {
  const manifest = buildRefreshManifest({
    mode: "incremental",
    startedAt: "2026-07-24T07:17:00.000Z",
    completedAt: "2026-07-24T07:19:00.000Z",
    outcomes: [
      outcome("unchanged", 120),
      outcome("compare-source", 430),
      outcome("fallback", 1_200, {
        diagnostic: "token ghp_secret at C:\\tmp\\clone",
        errorCode: "clone timeout C:\\tmp\\clone",
      }),
    ],
    usage: {
      graphqlRequests: 1,
      graphqlPoints: 25,
      graphqlRemaining: 4_975,
      restRequests: 2,
    },
  });

  expect(manifest.counts).toMatchObject({
    total: 3,
    checked: 3,
    changed: 2,
    unchanged: 1,
    fallback: 1,
  });
  expect(manifest.api).toEqual({
    graphql_requests: 1,
    graphql_points: 25,
    graphql_remaining: 4_975,
    rest_requests: 2,
  });
  expect(manifest.schema_version).toBe(3);
  expect(manifest.providers).toEqual({
    github: {
      checked: 3,
      changed: 2,
      failed: 0,
      requests: 3,
      remaining: 4_975,
    },
    codeberg: {
      checked: 0,
      changed: 0,
      failed: 0,
      requests: 0,
      remaining: null,
    },
  });
  expect(JSON.stringify(manifest)).not.toContain("ghp_secret");
  expect(JSON.stringify(manifest)).not.toContain("C:\\tmp\\clone");
});

test("reports isolated provider usage and outcomes", () => {
  const manifest = buildRefreshManifest({
    mode: "incremental",
    startedAt: "2026-07-24T07:17:00.000Z",
    completedAt: "2026-07-24T07:17:01.000Z",
    outcomes: [
      outcome("compare-source", 10, { provider: "github" }),
      outcome("failed", 10, {
        provider: "codeberg",
        snapshotChanged: false,
      }),
    ],
    providers: {
      github: { requests: 3, remaining: 4_997 },
      codeberg: { requests: 1, remaining: 0 },
    },
  });

  expect(manifest.providers).toEqual({
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

test("bounds timings, counts states, and records publication flags", () => {
  const outcomes = Array.from({ length: 260 }, (_, index) =>
    outcome(index === 0 ? "baseline" : "unchanged", index, {
      sourceId: `source-${String(index).padStart(3, "0")}`,
      evidenceStatus:
        index === 1 ? "provisional" : index === 2 ? "degraded" : "complete",
      sourceHealth: index === 3 ? "unavailable" : "healthy",
      snapshotChanged: index === 0,
    }),
  );
  outcomes.push(
    outcome("failed", 12, {
      evidenceStatus: "provisional",
      snapshotChanged: false,
    }),
  );

  const manifest = buildRefreshManifest({
    mode: "baseline",
    startedAt: "2026-07-24T07:17:00.000Z",
    completedAt: "2026-07-24T07:19:00.000Z",
    outcomes,
    usage: {},
    deploymentRequested: true,
  });

  expect(manifest.source_timings).toHaveLength(250);
  expect(manifest.counts).toMatchObject({
    provisional: 2,
    degraded: 1,
    unavailable: 1,
    failed: 1,
    baseline: 1,
  });
  expect(manifest.snapshot_changes).toBe(true);
  expect(manifest.deployment_requested).toBe(true);
});

test("supports a successful no-op run", () => {
  const manifest = buildRefreshManifest({
    mode: "incremental",
    startedAt: "2026-07-24T07:17:00.000Z",
    completedAt: "2026-07-24T07:17:01.000Z",
    outcomes: [],
    usage: {},
  });

  expect(manifest.counts.total).toBe(0);
  expect(manifest.snapshot_changes).toBe(false);
  expect(manifest.duration_ms).toBe(1_000);
});
