import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import {
  migrateRepositorySnapshots,
  migrateSnapshotV1,
} from "../../scripts/catalog/migrate-repository-snapshots.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function snapshotDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "tavernary-snapshots-"));
  temporaryDirectories.push(directory);
  return directory;
}

function versionOneSnapshot() {
  return {
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
      created_at: "2026-01-01T00:00:00.000Z",
      size_kb: 10,
    },
    source_health: "healthy",
    activity: {
      latest_meaningful_commit_at: "2026-07-20T00:00:00.000Z",
      weekly_meaningful_commits: [3, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 1],
      active_weeks_12: 4,
      strength: 4_006,
      dormant: false,
      latest_release_at: "2026-07-18T00:00:00.000Z",
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
    refreshed_at: "2026-07-24T00:00:00.000Z",
    stale_since: null,
  };
}

test("migrates rolling counts into oldest-first provisional booleans", () => {
  const snapshot = versionOneSnapshot();
  const migrated = migrateSnapshotV1(snapshot, "2026-07-24T12:00:00.000Z");

  expect(migrated).toEqual({
    ...snapshot,
    schema_version: 2,
    repository: {
      ...snapshot.repository,
      head_committed_at: null,
    },
    activity: {
      latest_source_activity_at: "2026-07-20T00:00:00.000Z",
      source_weeks: [],
      provisional_weeks: [
        true,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        true,
        false,
        true,
      ],
      latest_release_at: "2026-07-18T00:00:00.000Z",
      evidence_status: "provisional",
      baseline_completed_at: null,
      baseline_attempts: 0,
    },
  });
  expect(snapshot.schema_version).toBe(1);
});

test("rejects snapshots that are not version one", () => {
  expect(() =>
    migrateSnapshotV1(
      { ...versionOneSnapshot(), schema_version: 2 },
      "2026-07-24T12:00:00.000Z",
    ),
  ).toThrow("fixture: expected snapshot schema 1");
});

test("reports a dry run without modifying version one snapshots", async () => {
  const directory = await snapshotDirectory();
  const path = join(directory, "fixture.json");
  await writeFile(path, `${JSON.stringify(versionOneSnapshot(), null, 2)}\n`);

  const result = await migrateRepositorySnapshots({
    directory,
    now: "2026-07-24T12:00:00.000Z",
    write: false,
  });

  expect(result).toEqual({
    total: 1,
    migrated: 1,
    unchanged: 0,
    written: 0,
  });
  expect(JSON.parse(await readFile(path, "utf8")).schema_version).toBe(1);
});

test("atomically writes migrated snapshots and leaves version two unchanged", async () => {
  const directory = await snapshotDirectory();
  const firstPath = join(directory, "first.json");
  const secondPath = join(directory, "second.json");
  const versionTwo = migrateSnapshotV1(
    { ...versionOneSnapshot(), project_id: "second" },
    "2026-07-24T12:00:00.000Z",
  );
  await writeFile(
    firstPath,
    `${JSON.stringify(versionOneSnapshot(), null, 2)}\n`,
  );
  await writeFile(secondPath, `${JSON.stringify(versionTwo, null, 2)}\n`);

  const result = await migrateRepositorySnapshots({
    directory,
    now: "2026-07-24T12:00:00.000Z",
    write: true,
  });

  expect(result).toEqual({
    total: 2,
    migrated: 1,
    unchanged: 1,
    written: 1,
  });
  expect(JSON.parse(await readFile(firstPath, "utf8")).schema_version).toBe(2);
  expect(JSON.parse(await readFile(secondPath, "utf8"))).toEqual(versionTwo);
});

test("validates every snapshot before writing any migration", async () => {
  const directory = await snapshotDirectory();
  const validPath = join(directory, "valid.json");
  await writeFile(
    validPath,
    `${JSON.stringify(versionOneSnapshot(), null, 2)}\n`,
  );
  await writeFile(
    join(directory, "invalid.json"),
    `${JSON.stringify({ ...versionOneSnapshot(), schema_version: 99 }, null, 2)}\n`,
  );

  await expect(
    migrateRepositorySnapshots({
      directory,
      now: "2026-07-24T12:00:00.000Z",
      write: true,
    }),
  ).rejects.toThrow("invalid.json: unsupported snapshot schema 99");
  expect(JSON.parse(await readFile(validPath, "utf8")).schema_version).toBe(1);
});
