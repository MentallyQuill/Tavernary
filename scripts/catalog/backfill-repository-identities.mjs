import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { backfillRepositoryIdentities } from "./repository-identity-backfill.mjs";
import { formatJson } from "./json-format.mjs";
import { validateCatalog } from "./validate.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDirectory = resolve(rootDirectory, "data/registry/sources");
const snapshotDirectory = resolve(rootDirectory, "data/snapshots/github");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonDirectory(directory) {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(files.map((file) => readJson(resolve(directory, file))));
}

export async function planRepositoryIdentityBackfill({
  records,
  snapshots,
  sourceIds,
  validateCatalog: validate = validateCatalog,
}) {
  if (sourceIds) {
    const recordIds = new Set(records.map(({ id }) => id));
    for (const id of sourceIds) {
      if (!recordIds.has(id)) {
        throw new Error(`unknown source ID: ${id}`);
      }
    }
  }
  const result = backfillRepositoryIdentities(records, snapshots, {
    sourceIds,
  });
  const updatedById = new Map(
    result.updated.map((record) => [record.id, record]),
  );
  const projectedSources = records.map(
    (record) => updatedById.get(record.id) ?? record,
  );
  const validation = await validate({
    sources: projectedSources,
    snapshots,
  });

  return {
    ...result,
    projectedSources,
    validation,
  };
}

export function parseIdentityBackfillArguments(argv) {
  const ids = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") continue;
    if (argument === "--source-id") {
      const id = argv[index + 1];
      if (!id || id.startsWith("--")) {
        throw new Error("--source-id requires a value");
      }
      ids.push(id);
      index += 1;
      continue;
    }
    throw new Error(`unknown identity backfill argument: ${argument}`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("duplicate source ID");
  }
  return {
    write: argv.includes("--write"),
    sourceIds: ids.length > 0 ? new Set(ids) : null,
  };
}

async function loadRecords() {
  return readJsonDirectory(sourceDirectory);
}

async function loadSnapshots() {
  try {
    return await readJsonDirectory(snapshotDirectory);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeUpdatedRecords(
  records,
  directory = sourceDirectory,
) {
  for (const record of records) {
    await writeFile(
      resolve(directory, `${record.id}.json`),
      await formatJson(record),
    );
  }
}

async function main() {
  const arguments_ = parseIdentityBackfillArguments(process.argv.slice(2));
  const [records, snapshots] = await Promise.all([
    loadRecords(),
    loadSnapshots(),
  ]);
  const result = await planRepositoryIdentityBackfill({
    records,
    snapshots,
    sourceIds: arguments_.sourceIds,
  });

  console.log(
    `Repository identity backfill: changed=${result.summary.changed} skipped=${result.summary.skipped} conflicts=${result.summary.conflicts}`,
  );

  if (result.conflicts.length > 0) {
    for (const conflict of result.conflicts) {
      console.error(
        `${conflict.id}: ${conflict.reason} expected=${conflict.expected} received=${conflict.received}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  if (result.validation.errors.length > 0) {
    for (const error of result.validation.errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }

  if (arguments_.write) {
    await writeUpdatedRecords(result.updated);
    console.log(`Wrote ${result.updated.length} updated source files`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
