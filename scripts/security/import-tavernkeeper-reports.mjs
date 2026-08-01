import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  fetchAndValidateTavernKeeperIndex,
  validateReportIndex,
  writeReportSummaries,
} from "./tavernkeeper-reports.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOutputPath = resolve(
  rootDirectory,
  "data/security/tavernkeeper-report-summaries.json",
);

async function loadRegistry(root) {
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

export async function importTavernKeeperReports(options = {}) {
  const root = options.root ?? rootDirectory;
  const registry = options.registry ?? (await loadRegistry(root));
  const index = await fetchAndValidateTavernKeeperIndex(options);
  const summaries = validateReportIndex(index, registry);
  await writeReportSummaries(
    summaries,
    options.outputPath ??
      resolve(root, "data/security/tavernkeeper-report-summaries.json"),
  );
  return summaries;
}

async function main() {
  const summaries = await importTavernKeeperReports({
    outputPath: defaultOutputPath,
  });
  console.log(
    `Imported ${summaries.reports.length} TavernKeeper report summaries`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
