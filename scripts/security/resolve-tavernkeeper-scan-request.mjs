import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { canonicalSourceUrl } from "../../src/features/catalog/source-record.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function readJson(path) {
  return JSON.parse(await readFile(resolve(rootDirectory, path), "utf8"));
}

async function readJsonDirectory(path) {
  const directory = resolve(rootDirectory, path);
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(files.map((file) => readJson(`${path}/${file}`)));
}

function canonicalGitHubRepositoryUrl(value) {
  if (
    typeof value !== "string" ||
    !/^https:\/\/github\.com\/[^/?#\s]+\/[^/?#\s]+$/u.test(value) ||
    value.endsWith(".git")
  )
    throw new Error("Scan request requires one exact canonical GitHub URL.");
  return value;
}

export function resolveScanRequest({
  repositoryUrl: repositoryUrlInput,
  actorId,
  operators,
  sources,
  projects,
}) {
  if (
    !Number.isSafeInteger(actorId) ||
    actorId <= 0 ||
    !operators.includes(actorId)
  )
    throw new Error("GitHub actor is not authorized for TavernKeeper scans.");
  const repositoryUrl = canonicalGitHubRepositoryUrl(repositoryUrlInput);
  const publishedSourceIds = new Set(
    projects
      .filter((project) => project.listing_status === "active")
      .map((project) => project.source_id),
  );
  const source = sources.find(
    (candidate) =>
      candidate.type === "github" &&
      candidate.status === "active" &&
      Number.isSafeInteger(candidate.repository_id) &&
      candidate.repository_id > 0 &&
      candidate.id === `github-${candidate.repository_id}` &&
      publishedSourceIds.has(candidate.id) &&
      canonicalSourceUrl(candidate) === repositoryUrl,
  );
  if (source === undefined)
    throw new Error(
      "Canonical GitHub URL does not identify a published Tavernary project.",
    );
  return {
    sourceId: source.id,
    repositoryId: source.repository_id,
    repositoryUrl: canonicalSourceUrl(source),
  };
}

async function main() {
  const repositoryUrl = process.env.TAVERNARY_SCAN_REPOSITORY_URL;
  const actorId = Number(process.env.TAVERNARY_SCAN_ACTOR_ID);
  const [operatorConfig, sources, projects] = await Promise.all([
    readJson("config/tavernkeeper-scan-operators.json"),
    readJsonDirectory("data/registry/sources"),
    readJsonDirectory("data/registry/projects"),
  ]);
  return resolveScanRequest({
    repositoryUrl,
    actorId,
    operators: operatorConfig.github_user_ids,
    sources,
    projects,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.stdout.write(`${JSON.stringify(await main())}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Scan request failed."}\n`,
    );
    process.exitCode = 1;
  }
}
