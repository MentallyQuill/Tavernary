import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function repositoryKey(source) {
  return source.type === "github" || source.type === "codeberg"
    ? `${source.type}:${source.repository_id}`
    : null;
}

export class RegistryIntegrityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RegistryIntegrityError";
    this.code = code;
  }
}

function addUnique(map, key, value, code, label) {
  if (map.has(key)) {
    throw new RegistryIntegrityError(code, `Duplicate ${label}: ${key}`);
  }
  map.set(key, value);
}

export function indexRegistry({ projects, sources, snapshots }) {
  const projectsById = new Map();
  const sourcesById = new Map();
  const projectsBySourceId = new Map();
  const snapshotsBySourceId = new Map();
  const sourcesByRepositoryKey = new Map();

  for (const source of sources) {
    addUnique(
      sourcesById,
      source.id,
      source,
      "duplicate-source-id",
      "source ID",
    );
    const key = repositoryKey(source);
    if (key !== null) {
      addUnique(
        sourcesByRepositoryKey,
        key,
        source,
        "duplicate-repository-identity",
        "repository identity",
      );
    }
  }

  for (const project of projects) {
    addUnique(
      projectsById,
      project.id,
      project,
      "duplicate-project-id",
      "project ID",
    );
    if (!sourcesById.has(project.source_id)) {
      throw new RegistryIntegrityError(
        "missing-project-source",
        `${project.id}: source ${project.source_id} does not exist`,
      );
    }
    const siblings = projectsBySourceId.get(project.source_id) ?? [];
    siblings.push(project);
    projectsBySourceId.set(project.source_id, siblings);
  }

  for (const snapshot of snapshots) {
    if (!sourcesById.has(snapshot.source_id)) {
      throw new RegistryIntegrityError(
        "missing-snapshot-source",
        `Snapshot source ${snapshot.source_id} does not exist`,
      );
    }
    addUnique(
      snapshotsBySourceId,
      snapshot.source_id,
      snapshot,
      "duplicate-source-snapshot",
      "source snapshot",
    );
  }

  return {
    projects,
    sources,
    snapshots,
    projectsById,
    sourcesById,
    projectsBySourceId,
    snapshotsBySourceId,
    sourcesByRepositoryKey,
  };
}

async function readJsonDirectory(directory) {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(directory, file), "utf8")),
    ),
  );
}

export async function loadRegistryContext(root = DEFAULT_ROOT) {
  const [projects, sources, snapshots] = await Promise.all([
    readJsonDirectory(resolve(root, "data/registry/projects")),
    readJsonDirectory(resolve(root, "data/registry/sources")),
    readJsonDirectory(resolve(root, "data/snapshots/github")),
  ]);
  return indexRegistry({ projects, sources, snapshots });
}
