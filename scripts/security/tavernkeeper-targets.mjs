import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalSourceUrl } from "../../src/features/catalog/source-record.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOutputPath = resolve(
  rootDirectory,
  "public/security/tavernkeeper-targets.json",
);
const fullShaPattern = /^[0-9a-f]{40}$/u;

export function buildTavernKeeperTargets({
  sources,
  snapshots,
  publishedSourceIds,
  generatedAt,
}) {
  const snapshotsBySource = new Map(
    snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
  );
  const candidates = sources
    .flatMap((source) => {
      const snapshot = snapshotsBySource.get(source.id);
      const snapshotRepository = snapshot?.repository;
      const snapshotFullName =
        typeof snapshotRepository?.owner === "string" &&
        typeof snapshotRepository?.name === "string"
          ? `${snapshotRepository.owner}/${snapshotRepository.name}`
          : null;
      if (
        !publishedSourceIds.has(source.id) ||
        source.type !== "github" ||
        source.status !== "active" ||
        !Number.isSafeInteger(source.repository_id) ||
        source.repository_id <= 0 ||
        !snapshot ||
        snapshot.provider !== "github" ||
        snapshot.source_health !== "healthy" ||
        snapshot.stale_since != null ||
        snapshotRepository?.id !== source.repository_id ||
        snapshotFullName !== source.repository ||
        !fullShaPattern.test(snapshotRepository?.head_sha ?? "")
      ) {
        return [];
      }

      return [
        {
          source_id: source.id,
          provider: "github",
          repository_id: source.repository_id,
          repository: source.repository,
          target_sha: snapshotRepository.head_sha,
          canonical_url: canonicalSourceUrl(source),
        },
      ];
    })
    .sort(
      (left, right) =>
        left.repository_id - right.repository_id ||
        left.source_id.localeCompare(right.source_id),
    );
  const repositories = [];
  const repositoriesById = new Map();
  for (const candidate of candidates) {
    const existing = repositoriesById.get(candidate.repository_id);
    if (!existing) {
      repositoriesById.set(candidate.repository_id, candidate);
      repositories.push(candidate);
      continue;
    }
    if (
      existing.source_id !== candidate.source_id ||
      existing.repository !== candidate.repository ||
      existing.target_sha !== candidate.target_sha ||
      existing.canonical_url !== candidate.canonical_url
    ) {
      throw new Error(
        "TavernKeeper targets contain a conflicting duplicate repository id",
      );
    }
  }

  return {
    schema_version: 1,
    generated_at: new Date(generatedAt).toISOString(),
    repositories,
  };
}

export async function writeTavernKeeperTargets(
  manifest,
  outputPath = defaultOutputPath,
) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporaryPath, outputPath);
}
