import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildCatalog } from "./build.mjs";
import { refreshExtensionInstallEvidence } from "./extension-install-evidence.mjs";
import { publishInstallEvidence } from "./refresh-repositories.mjs";
import { repositoryProvider } from "./repository-provider.mjs";
import { validateCatalog } from "./validate.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function readJsonDirectory(relativePath) {
  const directory = resolve(rootDirectory, relativePath);
  try {
    const files = (await readdir(directory))
      .filter((file) => file.endsWith(".json"))
      .sort();
    return Promise.all(
      files.map(async (file) =>
        JSON.parse(await readFile(resolve(directory, file), "utf8")),
      ),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function readCanonicalInputs() {
  const [projects, sources, github, codeberg, installEvidence] =
    await Promise.all([
      readJsonDirectory("data/registry/projects"),
      readJsonDirectory("data/registry/sources"),
      readJsonDirectory("data/snapshots/github"),
      readJsonDirectory("data/snapshots/codeberg"),
      readJsonDirectory("data/snapshots/install"),
    ]);
  return {
    projects,
    sources,
    snapshots: [...github, ...codeberg],
    installEvidence,
  };
}

export async function backfillExtensionInstallEvidence(options = {}) {
  const inputs = options.inputs ?? (await readCanonicalInputs());
  const providers = options.providers ?? {
    github: repositoryProvider("github"),
    codeberg: repositoryProvider("codeberg"),
  };
  const result = await refreshExtensionInstallEvidence({
    projects: inputs.projects,
    sources: inputs.sources,
    snapshots: inputs.snapshots,
    previousEvidence: inputs.installEvidence,
    ...(options.sourceIds ? { sourceIds: options.sourceIds } : {}),
    retryReasons: new Set(["invalid-manifest"]),
    providers,
    observedAt: options.observedAt ?? new Date().toISOString(),
  });

  const validation = await (options.validate ?? validateCatalog)({
    records: inputs.projects,
    sources: inputs.sources,
    snapshots: inputs.snapshots,
    installEvidence: result.evidence,
  });
  if (validation?.errors?.length > 0) {
    throw new Error(
      `Install evidence validation failed:\n${validation.errors.join("\n")}`,
    );
  }
  await (options.build ?? buildCatalog)({
    write: false,
    records: inputs.projects,
    sources: inputs.sources,
    snapshots: inputs.snapshots,
    installEvidence: result.evidence,
  });
  await (options.publish ?? publishInstallEvidence)(result.changedEvidence);

  return {
    changed: result.changedEvidence.length,
    verified: result.evidence.filter(({ status }) => status === "verified")
      .length,
    unavailable: result.evidence.filter(
      ({ status }) => status === "unavailable",
    ).length,
  };
}

export function parseBackfillExtensionInstallEvidenceCli(argv) {
  const sourceIds = [];
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name !== "--source-id" || !value) {
      throw new Error(`Unknown or incomplete option: ${name ?? "missing"}.`);
    }
    sourceIds.push(value);
  }
  return { sourceIds: [...new Set(sourceIds)] };
}

async function main() {
  const { sourceIds } = parseBackfillExtensionInstallEvidenceCli(
    process.argv.slice(2),
  );
  const result = await backfillExtensionInstallEvidence(
    sourceIds.length > 0 ? { sourceIds } : {},
  );
  console.log(
    `Install evidence backfill complete: ${result.verified} verified, ${result.unavailable} unavailable, ${result.changed} changed`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
