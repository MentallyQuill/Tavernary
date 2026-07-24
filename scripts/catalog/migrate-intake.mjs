import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { migrateIntake } from "./intake-migration.mjs";
import { validateCatalog } from "./validate.mjs";

const defaultRootDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonWithBom(path) {
  return JSON.parse(stripBom(await readFile(path, "utf8")));
}

async function readExistingRecords(rootDirectory) {
  const projectsDirectory = resolve(rootDirectory, "data/registry/projects");
  const files = (await readdir(projectsDirectory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const records = await Promise.all(
    files.map(async (file) => readJson(resolve(projectsDirectory, file))),
  );
  return { files, records };
}

async function stageProjectFiles(rootDirectory, records) {
  const tempRoot = resolve(rootDirectory, ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const stageRoot = await mkdtemp(resolve(tempRoot, "catalog-migrate-"));
  const stagedProjectsDirectory = resolve(stageRoot, "data/registry/projects");
  await mkdir(stagedProjectsDirectory, { recursive: true });

  for (const record of records) {
    await writeFile(
      resolve(stagedProjectsDirectory, `${record.id}.json`),
      `${JSON.stringify(record, null, 2)}\n`,
    );
  }

  return {
    stageRoot,
    stagedProjectsDirectory,
    stagedReportPath: resolve(stageRoot, "data/registry/seed-migration-report.json"),
  };
}

function projectedRegistryRecords(existingRecords, expectedRecords) {
  return [
    ...existingRecords.filter((record) => record.metadata_status === "curated"),
    ...expectedRecords,
  ].sort((left, right) => left.id.localeCompare(right.id));
}

function assertExpectedAudit(report) {
  const expected = {
    intake_records: 213,
    curated_overlaps: 4,
    generated_records: 209,
    final_union_records: 214,
  };

  for (const [field, value] of Object.entries(expected)) {
    if (report[field] !== value) {
      throw new Error(
        `Migration audit mismatch for ${field}: expected ${value}, received ${report[field]}`,
      );
    }
  }
}

async function writeStageReport(stagedReportPath, report) {
  await mkdir(dirname(stagedReportPath), { recursive: true });
  await writeFile(stagedReportPath, `${JSON.stringify(report, null, 2)}\n`);
}

export async function runIntakeMigration(options = {}) {
  const rootDirectory = options.rootDirectory ?? defaultRootDirectory;
  const write = options.write === true;
  const enforceExpectedAudit =
    options.enforceExpectedAudit ?? rootDirectory === defaultRootDirectory;
  const intakePath = resolve(rootDirectory, "data/catalog/projects.json");
  const projectsDirectory = resolve(rootDirectory, "data/registry/projects");
  const reportPath = resolve(rootDirectory, "data/registry/seed-migration-report.json");
  const intake = await readJsonWithBom(intakePath);
  const { records: existingRecords } = await readExistingRecords(rootDirectory);
  const result = migrateIntake({ intake, existingRecords });
  if (result.report.provisional_drift.length > 0) {
    throw new Error(
      `Provisional drift detected: ${result.report.provisional_drift.join(", ")}`,
    );
  }
  if (enforceExpectedAudit) {
    assertExpectedAudit(result.report);
  }
  const finalRecords = projectedRegistryRecords(
    existingRecords,
    result.expectedRecords,
  );
  const validation = await validateCatalog({ records: finalRecords });
  if (validation.errors.length > 0) {
    throw new Error(
      `Projected registry validation failed:\n${validation.errors.join("\n")}`,
    );
  }

  const stage = await stageProjectFiles(rootDirectory, result.recordsToWrite);
  await writeStageReport(stage.stagedReportPath, result.report);

  if (write) {
    await mkdir(projectsDirectory, { recursive: true });
    for (const record of result.recordsToWrite) {
      await copyFile(
        resolve(stage.stagedProjectsDirectory, `${record.id}.json`),
        resolve(projectsDirectory, `${record.id}.json`),
        fsConstants.COPYFILE_EXCL,
      );
    }

    const temporaryReportPath = resolve(
      stage.stageRoot,
      "data/registry/seed-migration-report.write.json",
    );
    await cp(stage.stagedReportPath, temporaryReportPath, { force: true });
    await rename(temporaryReportPath, reportPath);
  }

  if (options.cleanup !== false) {
    await rm(stage.stageRoot, { recursive: true, force: true });
  }

  return {
    ...result,
    reportPath,
    validation,
  };
}

function parseArgs(argv) {
  return {
    write: argv.includes("--write"),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runIntakeMigration(options);
  console.log(JSON.stringify(result.report, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
