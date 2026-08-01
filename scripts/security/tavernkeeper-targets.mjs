import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOutputPath = resolve(
  rootDirectory,
  "public/security/tavernkeeper-targets.json",
);
const fullShaPattern = /^[0-9a-f]{40}$/u;

export function buildTavernKeeperTargets({ sources, snapshots, generatedAt }) {
  const snapshotsBySource = new Map(
    snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
  );
  const repositories = sources
    .flatMap((source) => {
      const snapshot = snapshotsBySource.get(source.id);
      if (
        source.type !== "github" ||
        source.status !== "active" ||
        !snapshot ||
        snapshot.provider !== "github" ||
        snapshot.source_health !== "healthy" ||
        snapshot.repository?.id !== source.repository_id ||
        !fullShaPattern.test(snapshot.repository?.head_sha ?? "")
      ) {
        return [];
      }

      return [
        {
          source_id: source.id,
          provider: "github",
          repository_id: source.repository_id,
          repository: source.repository,
          target_sha: snapshot.repository.head_sha,
          canonical_url: snapshot.repository.url,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.repository_id - right.repository_id ||
        left.source_id.localeCompare(right.source_id),
    );

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
