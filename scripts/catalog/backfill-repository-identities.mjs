import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { backfillRepositoryIdentities } from "./repository-identity-backfill.mjs";
import { validateCatalog } from "./validate.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const projectDirectory = resolve(rootDirectory, "data/registry/projects");
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
  validateCatalog: validate = validateCatalog,
}) {
  const result = backfillRepositoryIdentities(records, snapshots);
  const updatedById = new Map(
    result.updated.map((record) => [record.id, record]),
  );
  const projectedRecords = records.map(
    (record) => updatedById.get(record.id) ?? record,
  );
  const validation = await validate({
    records: projectedRecords,
    snapshots,
  });

  return {
    ...result,
    projectedRecords,
    validation,
  };
}

function hasWriteFlag(argv = process.argv) {
  return argv.includes("--write");
}

async function loadRecords() {
  return readJsonDirectory(projectDirectory);
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

async function writeUpdatedRecords(records) {
  for (const record of records) {
    await writeFile(
      resolve(projectDirectory, `${record.id}.json`),
      `${JSON.stringify(record, null, 2)}\n`,
    );
  }
}

async function main() {
  const [records, snapshots] = await Promise.all([
    loadRecords(),
    loadSnapshots(),
  ]);
  const result = await planRepositoryIdentityBackfill({ records, snapshots });

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

  if (hasWriteFlag()) {
    await writeUpdatedRecords(result.updated);
    console.log(`Wrote ${result.updated.length} updated project files`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
