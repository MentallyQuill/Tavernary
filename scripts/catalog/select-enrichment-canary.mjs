import { randomInt } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { selectEnrichmentRecords } from "./enrich-readmes.mjs";

export function selectRandomCanaryIds(records, options = {}) {
  const count = options.count ?? 5;
  const draw = options.randomInt ?? randomInt;
  const candidates = selectEnrichmentRecords(records)
    .filter((record) => record.refresh_policy === "automatic")
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

async function loadRecords() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const directory = resolve(root, "data/registry/projects");
  const files = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (name) =>
      JSON.parse(await readFile(resolve(directory, name), "utf8")),
    ),
  );
}

async function main() {
  const selected = selectRandomCanaryIds(await loadRecords());
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
