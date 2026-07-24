import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultSnapshotDirectory = resolve(
  rootDirectory,
  "data/snapshots/github",
);

export function migrateSnapshotV1(snapshot, now) {
  if (snapshot.schema_version !== 1) {
    throw new Error(`${snapshot.project_id}: expected snapshot schema 1`);
  }
  new Date(now).toISOString();

  return {
    ...snapshot,
    schema_version: 2,
    repository: {
      ...snapshot.repository,
      head_committed_at: null,
    },
    activity: {
      latest_source_activity_at: snapshot.activity.latest_meaningful_commit_at,
      source_weeks: [],
      provisional_weeks: snapshot.activity.weekly_meaningful_commits
        .map((count) => count > 0)
        .reverse(),
      latest_release_at: snapshot.activity.latest_release_at,
      evidence_status: "provisional",
      baseline_completed_at: null,
      baseline_attempts: 0,
    },
  };
}

export async function migrateRepositorySnapshots({
  directory = defaultSnapshotDirectory,
  now = new Date().toISOString(),
  write = false,
} = {}) {
  const migrationTimestamp = new Date(now).toISOString();
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const planned = [];

  for (const file of files) {
    const path = resolve(directory, file);
    const snapshot = JSON.parse(await readFile(path, "utf8"));
    if (snapshot.schema_version === 1) {
      planned.push({
        file,
        path,
        snapshot: migrateSnapshotV1(snapshot, migrationTimestamp),
        changed: true,
      });
    } else if (snapshot.schema_version === 2) {
      planned.push({ file, path, snapshot, changed: false });
    } else {
      throw new Error(
        `${file}: unsupported snapshot schema ${snapshot.schema_version}`,
      );
    }
  }

  const changed = planned.filter((entry) => entry.changed);
  if (write) {
    await Promise.all(
      changed.map(({ path, snapshot }) =>
        writeFile(`${path}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`),
      ),
    );
    for (const { path } of changed) {
      await rename(`${path}.tmp`, path);
    }
  }

  return {
    total: planned.length,
    migrated: changed.length,
    unchanged: planned.length - changed.length,
    written: write ? changed.length : 0,
  };
}

async function main() {
  const write = process.argv.slice(2).includes("--write");
  const result = await migrateRepositorySnapshots({ write });
  const action = write ? "Migrated" : "Would migrate";
  console.log(
    `${action} ${result.migrated} of ${result.total} snapshots; ${result.unchanged} already version 2`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
