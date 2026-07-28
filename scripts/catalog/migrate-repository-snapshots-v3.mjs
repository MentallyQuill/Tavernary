import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { formatJson } from "./json-format.mjs";

export function migrateRepositorySnapshotV3(snapshot) {
  if (snapshot.schema_version === 3) return snapshot;
  if (snapshot.schema_version !== 2) {
    throw new Error(
      `Unsupported repository snapshot schema: ${snapshot.schema_version}`,
    );
  }
  const { stargazers_count, forks_count, subscribers_count, aggregate } =
    snapshot.community;
  return {
    ...snapshot,
    schema_version: 3,
    provider: "github",
    ...(snapshot.contributors
      ? {
          contributors: {
            ...snapshot.contributors,
            accounts: snapshot.contributors.accounts.map((account) => ({
              ...account,
              provider: "github",
            })),
          },
        }
      : {}),
    community: {
      stars_count: stargazers_count,
      forks_count,
      watchers_count: subscribers_count,
      aggregate,
    },
  };
}

export async function migrateRepositorySnapshotsV3({
  directory = resolve("data/snapshots/github"),
  write = false,
} = {}) {
  const entries = await readdir(directory, { withFileTypes: true });
  const changed = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const path = resolve(directory, entry.name);
    const before = JSON.parse(await readFile(path, "utf8"));
    const after = migrateRepositorySnapshotV3(before);
    if (after === before) continue;
    changed.push(path);
    if (write) await writeFile(path, await formatJson(after), "utf8");
  }
  return changed;
}

async function main() {
  const write = process.argv.slice(2).includes("--write");
  const changed = await migrateRepositorySnapshotsV3({ write });
  process.stdout.write(
    `${write ? "Migrated" : "Would migrate"} ${changed.length} repository snapshots.\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
