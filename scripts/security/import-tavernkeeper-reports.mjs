import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  fetchAndValidateTavernKeeperIndex,
  validateReportIndex,
  writeReportSummaries,
} from "./tavernkeeper-reports.mjs";
import { loadTavernKeeperSourceRegistry } from "./validate-tavernkeeper-reports.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOutputPath = resolve(
  rootDirectory,
  "data/security/tavernkeeper-report-summaries.json",
);

export async function importTavernKeeperReports(options = {}) {
  const root = options.root ?? rootDirectory;
  const registry =
    options.registry ?? (await loadTavernKeeperSourceRegistry(root));
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
