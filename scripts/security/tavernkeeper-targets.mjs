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
const validProjectKinds = new Set(["extension", "frontend", "preset"]);
const supportedProjectKinds = new Set(["extension", "frontend"]);
const collator = new Intl.Collator("en", { sensitivity: "base" });

function validateContractVersion(value) {
  if (value !== 1 && value !== 2)
    throw new Error("TavernKeeper target contract version must be 1 or 2.");
  return value;
}

export function popularityTopProjectIds(projects, limit = 30) {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error("TavernKeeper popularity limit must be positive.");
  return new Set(
    [...projects]
      .sort((left, right) => {
        const leftScore = left.community?.aggregate ?? null;
        const rightScore = right.community?.aggregate ?? null;
        if (leftScore === null && rightScore !== null) return 1;
        if (leftScore !== null && rightScore === null) return -1;
        if (
          leftScore !== null &&
          rightScore !== null &&
          leftScore !== rightScore
        )
          return rightScore - leftScore;
        return (
          collator.compare(left.name, right.name) ||
          collator.compare(left.id, right.id)
        );
      })
      .slice(0, limit)
      .map(({ id }) => id),
  );
}

function metadataBySource(projects, publishedSourceIds, topProjectIds) {
  const metadata = new Map();
  for (const project of projects) {
    if (!publishedSourceIds.has(project.source_id)) continue;
    if (
      typeof project.id !== "string" ||
      typeof project.source_id !== "string" ||
      !validProjectKinds.has(project.kind)
    )
      throw new Error("Published TavernKeeper project metadata is invalid.");
    if (!supportedProjectKinds.has(project.kind)) continue;
    const catalogedAt = new Date(project.cataloged_at);
    if (!Number.isFinite(catalogedAt.getTime()))
      throw new Error("Published TavernKeeper catalog date is invalid.");
    const current = metadata.get(project.source_id) ?? {
      kinds: new Set(),
      firstCatalogedAt: null,
      top30: false,
    };
    current.kinds.add(project.kind);
    const canonicalDate = catalogedAt.toISOString();
    if (
      current.firstCatalogedAt === null ||
      canonicalDate < current.firstCatalogedAt
    )
      current.firstCatalogedAt = canonicalDate;
    if (topProjectIds.has(project.id)) current.top30 = true;
    metadata.set(project.source_id, current);
  }
  return metadata;
}

export function buildTavernKeeperTargets({
  contractVersion,
  sources,
  snapshots,
  projects,
  topProjectIds,
  publishedSourceIds,
  generatedAt,
}) {
  const version = validateContractVersion(contractVersion);
  const snapshotsBySource = new Map(
    snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
  );
  const projectMetadata =
    version === 2
      ? metadataBySource(projects, publishedSourceIds, topProjectIds)
      : new Map();
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
      const identity = {
        source_id: source.id,
        provider: "github",
        repository_id: source.repository_id,
        repository: source.repository,
        target_sha: snapshotRepository.head_sha,
        canonical_url: canonicalSourceUrl(source),
      };
      if (version === 1) return [identity];
      const metadata = projectMetadata.get(source.id);
      if (metadata === undefined || metadata.firstCatalogedAt === null)
        return [];
      return [
        {
          ...identity,
          project_kinds: [...metadata.kinds].sort(),
          catalog_priority: {
            top_30: metadata.top30,
            first_cataloged_at: metadata.firstCatalogedAt,
          },
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
    if (JSON.stringify(existing) !== JSON.stringify(candidate)) {
      throw new Error(
        "TavernKeeper targets contain a conflicting duplicate repository id",
      );
    }
  }

  return {
    schema_version: version,
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
