import { randomInt } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { selectEnrichmentRecords } from "./enrich-readmes.mjs";

function forceForSelectionMode(selectionMode) {
  if (!["pending", "all-automatic"].includes(selectionMode)) {
    throw new Error(`Unsupported enrichment selection mode: ${selectionMode}`);
  }
  return selectionMode === "all-automatic";
}

export function selectRandomCanaryIds(records, sourcesById, options = {}) {
  const count = options.count ?? 5;
  const draw = options.randomInt ?? randomInt;
  const force = forceForSelectionMode(options.selectionMode ?? "pending");
  const candidates = selectEnrichmentRecords(records, sourcesById, { force })
    .filter(
      (record) => sourcesById[record.source_id]?.refresh_policy === "automatic",
    )
    .map(({ id }) => id);

  if (candidates.length < count) {
    throw new Error(
      `Canary selection requires at least five refreshable enrichment candidates; found ${candidates.length}.`,
    );
  }

  for (let index = 0; index < count; index += 1) {
    const selectedIndex = index + draw(candidates.length - index);
    [candidates[index], candidates[selectedIndex]] = [
      candidates[selectedIndex],
      candidates[index],
    ];
  }

  return candidates.slice(0, count);
}

export function selectRepresentativeCanaryIds(
  records,
  sourcesById,
  snapshots,
  options = {},
) {
  const count = options.count ?? 7;
  const force = forceForSelectionMode(options.selectionMode ?? "pending");
  const candidates = selectEnrichmentRecords(records, sourcesById, { force })
    .filter(
      (record) => sourcesById[record.source_id]?.refresh_policy === "automatic",
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  if (candidates.length < 5) {
    throw new Error(
      `Canary selection requires at least five refreshable enrichment candidates; found ${candidates.length}.`,
    );
  }
  const snapshotsById = Array.isArray(snapshots)
    ? Object.fromEntries(
        snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
      )
    : snapshots;
  const selected = [];
  const choose = (predicate) => {
    const match = candidates.find(
      (record) => !selected.includes(record.id) && predicate(record),
    );
    if (match) selected.push(match.id);
  };
  const healthySnapshot = (record) => {
    const snapshot = snapshotsById?.[record.source_id];
    return snapshot?.source_health === "healthy" &&
      snapshot.stale_since === null
      ? snapshot
      : null;
  };

  choose((record) => {
    const description = healthySnapshot(record)?.repository?.description;
    return typeof description === "string" && description.trim().length > 0;
  });
  choose((record) => {
    const snapshot = healthySnapshot(record);
    return snapshot && !snapshot.repository?.description;
  });
  const selectedRecords = () =>
    selected.map((id) => candidates.find((record) => record.id === id));
  if (!selectedRecords().some((record) => record?.kind === "extension")) {
    choose((record) => record.kind === "extension");
  }
  if (!selectedRecords().some((record) => record?.kind !== "extension")) {
    choose((record) => record.kind !== "extension");
  }
  for (const record of candidates) {
    if (selected.length >= Math.min(count, candidates.length)) break;
    if (!selected.includes(record.id)) selected.push(record.id);
  }
  return selected;
}

async function loadCatalog() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const recordDirectory = resolve(root, "data/registry/projects");
  const sourceDirectory = resolve(root, "data/registry/sources");
  const recordFiles = (await readdir(recordDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  async function loadSnapshotEntries(provider) {
    const snapshotDirectory = resolve(root, `data/snapshots/${provider}`);
    try {
      return await Promise.all(
        (await readdir(snapshotDirectory))
          .filter((name) => name.endsWith(".json"))
          .sort()
          .map(async (name) => {
            const snapshot = JSON.parse(
              await readFile(resolve(snapshotDirectory, name), "utf8"),
            );
            return [snapshot.source_id, snapshot];
          }),
      );
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
  const [records, sources, snapshotEntries] = await Promise.all([
    Promise.all(
      recordFiles.map(async (name) =>
        JSON.parse(await readFile(resolve(recordDirectory, name), "utf8")),
      ),
    ),
    Promise.all(
      (await readdir(sourceDirectory))
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map(async (name) =>
          JSON.parse(await readFile(resolve(sourceDirectory, name), "utf8")),
        ),
    ),
    Promise.all([
      loadSnapshotEntries("github"),
      loadSnapshotEntries("codeberg"),
    ]).then((entries) => entries.flat()),
  ]);
  return {
    records,
    sources: Object.fromEntries(sources.map((source) => [source.id, source])),
    snapshots: Object.fromEntries(snapshotEntries),
  };
}

async function main() {
  const { records, sources, snapshots } = await loadCatalog();
  const selected = selectRepresentativeCanaryIds(records, sources, snapshots, {
    selectionMode: process.env.ENRICHMENT_SELECTION_MODE ?? "pending",
  });
  process.stdout.write(`${selected.join("\n")}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
