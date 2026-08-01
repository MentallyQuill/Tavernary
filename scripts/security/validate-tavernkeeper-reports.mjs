import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateStoredReportIndex } from "./tavernkeeper-reports.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultSummaryPath = resolve(
  rootDirectory,
  "data/security/tavernkeeper-report-summaries.json",
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

async function main() {
  const summaries = await validateStoredTavernKeeperReports({
    inputPath: defaultSummaryPath,
  });
  console.log(
    `Validated ${summaries.reports.length} tracked TavernKeeper report summaries`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
