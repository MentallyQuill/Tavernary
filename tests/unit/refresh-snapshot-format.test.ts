import { expect, test } from "vitest";

import * as refreshModule from "../../scripts/catalog/refresh-github.mjs";
import { migrateRepositorySnapshotV3 } from "../../scripts/catalog/migrate-repository-snapshots-v3.mjs";

const schemaV2Snapshot = {
  schema_version: 2 as const,
  project_id: "owner-repo",
  repository: { id: 42 },
  source_health: "healthy",
  activity: { evidence_status: "complete" },
  contributors: {
    accounts: [{ login: "owner", type: "User" }],
    refreshed_at: "2026-07-25T18:00:00.000Z",
    stale_since: null,
  },
  community: {
    stargazers_count: 3,
    forks_count: 2,
    subscribers_count: 1,
    aggregate: 6,
  },
  license: { status: "missing", spdx_id: null, source_path: null },
  refreshed_at: "2026-07-25T18:00:00.000Z",
  stale_since: null,
};

test("serializes refreshed snapshots in repository Prettier format", async () => {
  const formatSnapshot = (
    refreshModule as {
      formatSnapshot?: (snapshot: unknown) => Promise<string>;
    }
  ).formatSnapshot;

  expect(formatSnapshot).toBeTypeOf("function");
  if (!formatSnapshot) return;

  const serialized = await formatSnapshot({
    activity: {
      source_weeks: [
        {
          week_start: "2026-07-20",
          latest_at: "2026-07-24T00:00:00.000Z",
          precision: "interval",
        },
      ],
    },
  });

  expect(serialized).toContain('"week_start": "2026-07-20"');
  expect(serialized.endsWith("\n")).toBe(true);
});

test("migrates a GitHub repository snapshot from v2 to v3 without recalculating evidence", () => {
  const migrated = migrateRepositorySnapshotV3(schemaV2Snapshot);

  expect(migrated.schema_version).toBe(3);
  expect(migrated.provider).toBe("github");
  expect(migrated.community).toEqual({
    stars_count: schemaV2Snapshot.community.stargazers_count,
    forks_count: schemaV2Snapshot.community.forks_count,
    watchers_count: schemaV2Snapshot.community.subscribers_count,
    aggregate: schemaV2Snapshot.community.aggregate,
  });
  expect(migrated.activity).toEqual(schemaV2Snapshot.activity);
  expect(migrated.refreshed_at).toBe(schemaV2Snapshot.refreshed_at);
  expect(migrated.contributors?.accounts).toEqual([
    { provider: "github", login: "owner", type: "User" },
  ]);
});
