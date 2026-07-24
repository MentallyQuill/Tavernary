import {
  copyFile,
  cp,
  mkdir,
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
  const stageRoot = resolve(rootDirectory, ".tmp/catalog-migrate");
  const stagedProjectsDirectory = resolve(stageRoot, "data/registry/projects");
  await rm(stageRoot, { recursive: true, force: true });
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

async function writeStageReport(stagedReportPath, report) {
  await mkdir(dirname(stagedReportPath), { recursive: true });
  await writeFile(stagedReportPath, `${JSON.stringify(report, null, 2)}\n`);
}

export async function runIntakeMigration(options = {}) {
  const rootDirectory = options.rootDirectory ?? defaultRootDirectory;
  const write = options.write === true;
  const intakePath = resolve(rootDirectory, "data/catalog/projects.json");
  const projectsDirectory = resolve(rootDirectory, "data/registry/projects");
  const reportPath = resolve(rootDirectory, "data/registry/seed-migration-report.json");
  const intake = await readJsonWithBom(intakePath);
  const { records: existingRecords } = await readExistingRecords(rootDirectory);
  const result = migrateIntake({ intake, existingRecords });
  const finalRecords = [...existingRecords, ...result.recordsToWrite].sort((left, right) =>
    left.id.localeCompare(right.id),
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

    const temporaryReportPath = `${reportPath}.tmp`;
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
