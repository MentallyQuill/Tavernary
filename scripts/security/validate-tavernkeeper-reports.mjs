import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateStoredReportIndex } from "./tavernkeeper-reports.mjs";
import { validateTavernKeeperImportState } from "./tavernkeeper-import-state.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultSummaryPath = resolve(
  rootDirectory,
  "data/security/tavernkeeper-report-summaries.json",
);
const defaultImportStatePath = resolve(
  rootDirectory,
  "data/security/tavernkeeper-import-state.json",
);

export async function loadTavernKeeperSourceRegistry(root = rootDirectory) {
  const directory = resolve(root, "data/registry/sources");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(directory, file), "utf8")),
    ),
  );
}

export async function validateStoredTavernKeeperReports(options = {}) {
  const root = options.root ?? rootDirectory;
  const [contents, registry] = await Promise.all([
    readFile(
      options.inputPath ??
        resolve(root, "data/security/tavernkeeper-report-summaries.json"),
      "utf8",
    ),
    options.registry ?? loadTavernKeeperSourceRegistry(root),
  ]);
  return validateStoredReportIndex(JSON.parse(contents), registry);
}

export async function validateStoredTavernKeeperImportState(options = {}) {
  const root = options.root ?? rootDirectory;
  const contents = await readFile(
    options.inputPath ??
      resolve(root, "data/security/tavernkeeper-import-state.json"),
    "utf8",
  );
  return validateTavernKeeperImportState(JSON.parse(contents));
}

async function main() {
  const [summaries, importState] = await Promise.all([
    validateStoredTavernKeeperReports({ inputPath: defaultSummaryPath }),
    validateStoredTavernKeeperImportState({
      inputPath: defaultImportStatePath,
    }),
  ]);
  console.log(
    `Validated ${summaries.reports.length} tracked TavernKeeper report summaries and ${importState.quarantines.length} quarantined imports`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
