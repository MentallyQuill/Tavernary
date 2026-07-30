import {
  access as fsAccess,
  mkdir as fsMkdir,
  readFile as fsReadFile,
  readdir as fsReaddir,
  rename as fsRename,
  rm as fsRm,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { legacySourceId } from "../../src/features/catalog/source-record.mjs";
import { planTagBackfill } from "./backfill-project-tags.mjs";
import { formatJson } from "./json-format.mjs";
import { validateCatalog } from "./validate.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export class SourceMigrationConflictError extends Error {
  constructor({ sourceId, projectIds }) {
    super(
      `${sourceId}: conflicting source facts claimed by ${projectIds.join(", ")}`,
    );
    this.name = "SourceMigrationConflictError";
    this.code = "conflicting-source-identity";
    this.sourceId = sourceId;
    this.projectIds = projectIds;
  }
}

function requireLegacyProject(project) {
  if (project?.schema_version !== 5) {
    throw new Error(
      `${project?.id ?? "unknown"}: expected project schema version 5`,
    );
  }
  if (typeof project.id !== "string" || !project.source) {
    throw new Error("Legacy project requires an ID and inline source.");
  }
}

function sourceLifecycle(project) {
  const delisted =
    project.visibility === "disabled" &&
    project.visibility_reason === "removed";
  return {
    status: delisted ? "delisted" : "active",
    status_reason: delisted ? "removed" : null,
    refresh_policy: delisted ? "paused" : project.refresh_policy,
  };
}

function migrateSource(project) {
  const id = legacySourceId(project);
  return {
    schema_version: 1,
    id,
    ...structuredClone(project.source),
    ...sourceLifecycle(project),
  };
}

function cardLifecycle(project) {
  if (project.visibility === "quarantined") {
    return {
      listing_status: "quarantined",
      listing_status_reason: project.visibility_reason,
    };
  }
  if (
    project.visibility === "disabled" &&
    project.visibility_reason !== "removed"
  ) {
    return {
      listing_status: "retired",
      listing_status_reason: project.visibility_reason,
    };
  }
  return {
    listing_status: "active",
    listing_status_reason: null,
  };
}

function migrateProject(project, sourceId, metadata) {
  const {
    schema_version: _schemaVersion,
    source: _source,
    refresh_policy: _refreshPolicy,
    visibility: _visibility,
    visibility_reason: _visibilityReason,
    capabilities: _capabilities,
    enrichment_policy: _enrichmentPolicy,
    enrichment_note: _enrichmentNote,
    ...card
  } = project;
  return {
    schema_version: 6,
    ...card,
    source_id: sourceId,
    tags: structuredClone(metadata.tags),
    ...cardLifecycle(project),
    metadata_policy: structuredClone(metadata.metadata_policy),
  };
}

function migrateSnapshot(snapshot, sourceId) {
  const {
    schema_version: _schemaVersion,
    project_id: _projectId,
    ...facts
  } = snapshot;
  return {
    schema_version: 4,
    ...facts,
    source_id: sourceId,
  };
}

function snapshotDirectory(provider) {
  if (provider !== "github" && provider !== "codeberg") {
    throw new Error(`Unsupported snapshot provider: ${provider}`);
  }
  return `data/snapshots/${provider}`;
}

function migrateRefreshManifest(refreshManifest, sourceIdByProjectId) {
  const { project_timings: projectTimings = [], ...manifest } = refreshManifest;
  return {
    ...structuredClone(manifest),
    schema_version: 3,
    source_timings: projectTimings.map(
      ({ project_id: projectId, ...timing }) => {
        const sourceId = sourceIdByProjectId.get(projectId);
        if (!sourceId) {
          throw new Error(
            `Refresh timing references unknown project ID: ${projectId}`,
          );
        }
        return { source_id: sourceId, ...structuredClone(timing) };
      },
    ),
  };
}

export function planSourceRegistryMigration({
  projects,
  snapshots,
  refreshManifest,
  metadataByProjectId,
}) {
  const sources = [];
  const migratedProjects = [];
  const sourceById = new Map();
  const projectIdsBySourceId = new Map();
  const sourceIdByProjectId = new Map();
  const projectIds = new Set();

  for (const project of projects) {
    requireLegacyProject(project);
    if (projectIds.has(project.id)) {
      throw new Error(`Duplicate legacy project ID: ${project.id}`);
    }
    projectIds.add(project.id);
    const metadata =
      metadataByProjectId instanceof Map
        ? metadataByProjectId.get(project.id)
        : metadataByProjectId?.[project.id];
    if (!metadata) {
      throw new Error(`${project.id}: migration metadata is required`);
    }
    const source = migrateSource(project);
    const existing = sourceById.get(source.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(source)) {
      throw new SourceMigrationConflictError({
        sourceId: source.id,
        projectIds: [
          ...(projectIdsBySourceId.get(source.id) ?? []),
          project.id,
        ],
      });
    }
    if (!existing) {
      sourceById.set(source.id, source);
      sources.push(source);
    }
    projectIdsBySourceId.set(source.id, [
      ...(projectIdsBySourceId.get(source.id) ?? []),
      project.id,
    ]);
    sourceIdByProjectId.set(project.id, source.id);
    migratedProjects.push(migrateProject(project, source.id, metadata));
  }

  const snapshotSourceIds = new Set();
  const migratedSnapshots = snapshots.map((snapshot) => {
    const sourceId = sourceIdByProjectId.get(snapshot.project_id);
    if (!sourceId) {
      throw new Error(
        `Snapshot references unknown project ID: ${snapshot.project_id}`,
      );
    }
    if (snapshotSourceIds.has(sourceId)) {
      throw new Error(`Duplicate source snapshot: ${sourceId}`);
    }
    snapshotSourceIds.add(sourceId);
    return migrateSnapshot(snapshot, sourceId);
  });
  const migratedRefreshManifest = migrateRefreshManifest(
    refreshManifest,
    sourceIdByProjectId,
  );
  const operations = [
    ...sources.map((source) => ({
      kind: "create",
      path: `data/registry/sources/${source.id}.json`,
      value: source,
    })),
    ...migratedProjects.map((project) => ({
      kind: "update",
      path: `data/registry/projects/${project.id}.json`,
      value: project,
    })),
    ...migratedSnapshots.flatMap((snapshot, index) => {
      const prior = snapshots[index];
      const directory = snapshotDirectory(snapshot.provider);
      const destination = `${directory}/${snapshot.source_id}.json`;
      const priorPath = `${directory}/${prior.project_id}.json`;
      return [
        { kind: "create", path: destination, value: snapshot },
        ...(priorPath === destination
          ? []
          : [{ kind: "delete", path: priorPath }]),
      ];
    }),
    {
      kind: "update",
      path: "data/snapshots/github-refresh.json",
      value: migratedRefreshManifest,
    },
  ];

  return {
    counts: {
      projects: migratedProjects.length,
      sources: sources.length,
      snapshots: migratedSnapshots.length,
      delistedSources: sources.filter(({ status }) => status === "delisted")
        .length,
    },
    projects: migratedProjects,
    sources,
    snapshots: migratedSnapshots,
    refreshManifest: migratedRefreshManifest,
    operations,
  };
}

function resolveOperationPaths(plan, root) {
  const resolvedRoot = resolve(root);
  return plan.operations.map((operation) => {
    const absolutePath = resolve(resolvedRoot, operation.path);
    const relativePath = relative(resolvedRoot, absolutePath);
    if (
      relativePath === "" ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      throw new Error(
        `Migration path escapes the supplied root: ${operation.path}`,
      );
    }
    return { ...operation, absolutePath };
  });
}

export async function writeSourceRegistryMigration(
  plan,
  {
    root,
    write = false,
    validatePlan = async () => {},
    writeFile = fsWriteFile,
    rename = fsRename,
    remove = fsRm,
    mkdir = fsMkdir,
    access = fsAccess,
  },
) {
  const operations = resolveOperationPaths(plan, root);
  if (!write) {
    return {
      written: false,
      paths: operations.map(({ path }) => path),
    };
  }

  await validatePlan(plan);

  const token = `${process.pid}-${Date.now()}`;
  const writeRank = ({ path }) => {
    if (path.startsWith("data/registry/sources/")) return 0;
    if (path.startsWith("data/registry/projects/")) return 1;
    if (path === "data/snapshots/github-refresh.json") return 3;
    return 2;
  };
  const writes = operations
    .filter(({ kind }) => kind !== "delete")
    .sort((left, right) => writeRank(left) - writeRank(right));
  const deletions = operations.filter(({ kind }) => kind === "delete");
  const staged = [];
  const committed = [];

  const exists = async (path) => {
    try {
      await access(path);
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  };
  const cleanup = async (path) => {
    try {
      await remove(path, { force: true });
    } catch {
      // Cleanup must not hide the migration error that triggered rollback.
    }
  };

  try {
    for (const [index, operation] of writes.entries()) {
      const temporaryPath = `${operation.absolutePath}.source-migration-${token}-${index}.tmp`;
      await mkdir(dirname(operation.absolutePath), { recursive: true });
      staged.push({ ...operation, temporaryPath });
      await writeFile(temporaryPath, await formatJson(operation.value));
    }

    for (const [index, operation] of staged.entries()) {
      const backupPath = `${operation.absolutePath}.source-migration-${token}-${index}.bak`;
      const hadPrior = await exists(operation.absolutePath);
      if (hadPrior) {
        await rename(operation.absolutePath, backupPath);
      }
      try {
        await rename(operation.temporaryPath, operation.absolutePath);
      } catch (error) {
        if (hadPrior) {
          await rename(backupPath, operation.absolutePath);
        }
        throw error;
      }
      committed.push({ ...operation, backupPath, hadPrior, kind: "write" });
    }

    for (const [index, operation] of deletions.entries()) {
      if (!(await exists(operation.absolutePath))) continue;
      const backupPath = `${operation.absolutePath}.source-migration-${token}-${index}.bak`;
      await rename(operation.absolutePath, backupPath);
      committed.push({
        ...operation,
        backupPath,
        hadPrior: true,
        kind: "delete",
      });
    }
  } catch (error) {
    for (const operation of [...committed].reverse()) {
      if (operation.kind === "delete") {
        if (await exists(operation.backupPath)) {
          await rename(operation.backupPath, operation.absolutePath);
        }
        continue;
      }
      await cleanup(operation.absolutePath);
      if (operation.hadPrior && (await exists(operation.backupPath))) {
        await rename(operation.backupPath, operation.absolutePath);
      }
    }
    for (const operation of staged) {
      await cleanup(operation.temporaryPath);
      await cleanup(operation.backupPath);
    }
    throw error;
  }

  for (const operation of committed) {
    await cleanup(operation.backupPath);
  }

  return {
    written: true,
    paths: operations.map(({ path }) => path),
  };
}

async function readJson(path) {
  return JSON.parse(await fsReadFile(path, "utf8"));
}

async function readJsonDirectory(path, { optional = false } = {}) {
  let files;
  try {
    files = (await fsReaddir(path))
      .filter((file) => file.endsWith(".json"))
      .sort();
  } catch (error) {
    if (optional && error?.code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(files.map((file) => readJson(resolve(path, file))));
}

async function readOptionalJson(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function loadMigrationInput(root) {
  const [
    projects,
    sources,
    githubSnapshots,
    codebergSnapshots,
    refreshManifest,
    vocabulary,
    classifierResults,
    kits,
    supportSnapshots,
    blockedUsers,
  ] = await Promise.all([
    readJsonDirectory(resolve(root, "data/registry/projects")),
    readJsonDirectory(resolve(root, "data/registry/sources"), {
      optional: true,
    }),
    readJsonDirectory(resolve(root, "data/snapshots/github")),
    readJsonDirectory(resolve(root, "data/snapshots/codeberg"), {
      optional: true,
    }),
    readJson(resolve(root, "data/snapshots/github-refresh.json")),
    readJson(resolve(root, "data/vocabularies/tags.json")),
    readOptionalJson(
      resolve(
        root,
        "local-data/catalog-evidence/tag-classifier-results.audit.json",
      ),
    ),
    readJsonDirectory(resolve(root, "data/registry/kits")),
    readJsonDirectory(resolve(root, "data/snapshots/github/kits"), {
      optional: true,
    }),
    readJson(resolve(root, "data/moderation/blocked-github-users.json")),
  ]);
  return {
    projects,
    sources,
    snapshots: [...githubSnapshots, ...codebergSnapshots],
    refreshManifest,
    vocabulary,
    classifierResults,
    kits,
    supportSnapshots,
    blockedUsers,
  };
}

function parseMigrationArguments(arguments_) {
  if (arguments_.length === 0) return { write: false };
  if (arguments_.length === 1 && arguments_[0] === "--write") {
    return { write: true };
  }
  throw new Error("Usage: migrate-source-registry-v1.mjs [--write]");
}

function migrationCounts(plan, input, writes) {
  return {
    projects: plan.projects.length,
    sources: plan.sources.length,
    repositorySnapshots: plan.snapshots.length,
    delistedSources: plan.sources.filter(({ status }) => status === "delisted")
      .length,
    kits: input.kits.length,
    kitProjectReferences: input.kits.reduce(
      (count, kit) => count + (kit.project_ids?.length ?? 0),
      0,
    ),
    writes,
  };
}

function formatMigrationCounts(counts) {
  return [
    `projects=${counts.projects}`,
    `sources=${counts.sources}`,
    `repository_snapshots=${counts.repositorySnapshots}`,
    `delisted_sources=${counts.delistedSources}`,
    `kits=${counts.kits}`,
    `kit_project_references=${counts.kitProjectReferences}`,
    `writes=${counts.writes}`,
  ].join(" ");
}

async function validateMigrationCandidate(plan, input) {
  const result = await validateCatalog({
    records: plan.projects,
    sources: plan.sources,
    snapshots: plan.snapshots,
    refreshManifest: plan.refreshManifest,
    tagVocabulary: input.vocabulary,
    kitRecords: input.kits,
    supportSnapshots: input.supportSnapshots,
    blockedUsers: input.blockedUsers,
  });
  if (result.errors.length > 0) {
    throw new Error(
      `Combined source/tag migration is invalid:\n${result.errors.join("\n")}`,
    );
  }
}

function canonicalNoopPlan(input) {
  return {
    counts: {
      projects: input.projects.length,
      sources: input.sources.length,
      snapshots: input.snapshots.length,
      delistedSources: input.sources.filter(
        ({ status }) => status === "delisted",
      ).length,
    },
    projects: input.projects,
    sources: input.sources,
    snapshots: input.snapshots,
    refreshManifest: input.refreshManifest,
    operations: [],
  };
}

export async function runSourceRegistryMigrationCli(arguments_, options = {}) {
  const { write } = parseMigrationArguments(arguments_);
  const root = options.root ?? repositoryRoot;
  const input = await (options.loadInput ?? loadMigrationInput)(root);
  const versions = new Set(
    input.projects.map(({ schema_version: schemaVersion }) => schemaVersion),
  );
  if (versions.size !== 1 || ![5, 6].includes([...versions][0])) {
    throw new Error(
      "Source registry migration requires one complete project schema version.",
    );
  }

  let plan;
  if (versions.has(6)) {
    plan = canonicalNoopPlan(input);
  } else {
    if (!Array.isArray(input.classifierResults)) {
      throw new Error(
        "Schema-v5 migration requires complete local tag classifier results.",
      );
    }
    const tagPlan = (options.planTags ?? planTagBackfill)({
      projects: input.projects,
      vocabulary: input.vocabulary,
      classifierResults: input.classifierResults,
    });
    plan = planSourceRegistryMigration({
      projects: input.projects,
      snapshots: input.snapshots,
      refreshManifest: input.refreshManifest,
      metadataByProjectId: tagPlan.metadataByProjectId,
    });
    plan.operations.push({
      kind: "update",
      path: "data/reports/tag-migration-report.json",
      value: tagPlan.report,
    });
  }

  const validatePlan =
    options.validatePlan ??
    ((candidate) => validateMigrationCandidate(candidate, input));
  await validatePlan(plan);
  const report = await (options.writeMigration ?? writeSourceRegistryMigration)(
    plan,
    {
      root,
      write,
      validatePlan: async () => {},
    },
  );
  const counts = migrationCounts(plan, input, write ? report.paths.length : 0);
  (options.logger ?? console).log(formatMigrationCounts(counts));
  return { plan, report, counts };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runSourceRegistryMigrationCli(process.argv.slice(2));
}
