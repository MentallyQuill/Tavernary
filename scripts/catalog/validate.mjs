import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv from "ajv";

import { validateKitData } from "../kits/validation.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const approvedOrganizationRecord = {
  id: "tavern-rpg-suite",
  organization: "tavern-rpg-suite",
  url: "https://github.com/tavern-rpg-suite",
};

async function readJson(path) {
  return JSON.parse(await readFile(resolve(rootDirectory, path), "utf8"));
}

async function loadRecords() {
  const directory = resolve(rootDirectory, "data/registry/projects");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map((file) => readJson(`data/registry/projects/${file}`)),
  );
}

async function loadSnapshots() {
  const directory = resolve(rootDirectory, "data/snapshots/github");
  let files;
  try {
    files = (await readdir(directory))
      .filter((file) => file.endsWith(".json"))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return Promise.all(
    files.map((file) => readJson(`data/snapshots/github/${file}`)),
  );
}

async function loadRefreshManifest() {
  return readJson("data/snapshots/github-refresh.json");
}

async function loadJsonDirectory(path) {
  const directory = resolve(rootDirectory, path);
  let files;
  try {
    files = (await readdir(directory))
      .filter((file) => file.endsWith(".json"))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return Promise.all(files.map((file) => readJson(`${path}/${file}`)));
}

function vocabularyIds(vocabulary, property) {
  return new Set(vocabulary[property].map(({ id }) => id));
}

function sourceKey(source) {
  if (source.type === "github") {
    return `github:${source.repository.toLowerCase()}`;
  }
  if (source.type === "github-organization") {
    return `github-organization:${source.organization.toLowerCase()}`;
  }

  try {
    const url = new URL(source.url);
    url.hash = "";
    return `url:${url.href}`;
  } catch {
    return `url:${source.url}`;
  }
}

function schemaError(record, error) {
  const location = error.instancePath || "/";
  return `${record.id ?? "<unknown>"}: schema ${location} ${error.message}`;
}

function validateSnapshotEvidence(snapshot) {
  const id = snapshot.project_id;
  const { activity, repository } = snapshot;
  const errors = [];

  if (
    repository.head_committed_at === null &&
    activity.evidence_status !== "provisional"
  ) {
    errors.push(
      `${id}: null head_committed_at is allowed only for provisional evidence`,
    );
  }

  if (activity.evidence_status === "complete") {
    if (activity.provisional_weeks !== null) {
      errors.push(`${id}: complete evidence cannot retain provisional_weeks`);
    }
    if (activity.baseline_completed_at === null) {
      errors.push(`${id}: complete evidence requires baseline_completed_at`);
    }
  }

  if (
    activity.evidence_status === "provisional" &&
    activity.baseline_completed_at !== null
  ) {
    errors.push(
      `${id}: provisional evidence cannot have baseline_completed_at`,
    );
  }

  if (snapshot.activity_scan && activity.evidence_status !== "provisional") {
    errors.push(`${id}: activity scan requires provisional evidence`);
  }

  if (
    activity.provisional_weeks !== null &&
    !["provisional", "degraded"].includes(activity.evidence_status)
  ) {
    errors.push(
      `${id}: provisional_weeks requires provisional or degraded evidence`,
    );
  }

  const weekStarts = activity.source_weeks.map(({ week_start }) => week_start);
  const seen = new Set();
  for (const weekStart of weekStarts) {
    const date = new Date(`${weekStart}T00:00:00.000Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== weekStart ||
      date.getUTCDay() !== 1
    ) {
      errors.push(`${id}: source week ${weekStart} is not a Monday UTC`);
    }
    if (seen.has(weekStart)) {
      errors.push(`${id}: duplicate source week ${weekStart}`);
    }
    seen.add(weekStart);
  }

  const sortedWeekStarts = [...weekStarts].sort((left, right) =>
    right.localeCompare(left),
  );
  if (
    weekStarts.some((weekStart, index) => weekStart !== sortedWeekStarts[index])
  ) {
    errors.push(`${id}: source_weeks must be sorted newest to oldest`);
  }

  const contributorLogins = new Set();
  for (const account of snapshot.contributors?.accounts ?? []) {
    const login = account.login.toLocaleLowerCase("en");
    if (contributorLogins.has(login)) {
      errors.push(`${id}: duplicate contributor username ${login}`);
    }
    contributorLogins.add(login);
  }

  return errors;
}

export async function validateCatalog(options = {}) {
  const [
    schema,
    snapshotSchema,
    refreshManifestSchema,
    frontendVocabulary,
    functionVocabulary,
    capabilityVocabulary,
  ] = await Promise.all([
    readJson("data/schemas/project.schema.json"),
    readJson("data/schemas/repository-snapshot.schema.json"),
    readJson("data/schemas/github-refresh.schema.json"),
    readJson("data/vocabularies/frontends.json"),
    readJson("data/vocabularies/primary-functions.json"),
    readJson("data/vocabularies/capabilities.json"),
  ]);

  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addFormat("uri", {
    type: "string",
    validate(value) {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
  });
  ajv.addFormat(
    "date-time",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,
  );

  const validateRecord = ajv.compile(schema);
  const validateSnapshot = ajv.compile(snapshotSchema);
  const validateRefreshManifest = ajv.compile(refreshManifestSchema);
  const records = options.records ?? (await loadRecords());
  const snapshots =
    options.snapshots ?? (options.records ? [] : await loadSnapshots());
  const refreshManifest =
    options.refreshManifest ?? (await loadRefreshManifest());
  const kitRecords =
    options.kitRecords ??
    (options.records ? [] : await loadJsonDirectory("data/registry/kits"));
  const supportSnapshots =
    options.supportSnapshots ??
    (options.records
      ? []
      : await loadJsonDirectory("data/snapshots/github/kits"));
  const blockedUsers =
    options.blockedUsers ??
    (options.records
      ? { schema_version: 1, blocked: [] }
      : await readJson("data/moderation/blocked-github-users.json"));
  const frontendIds = vocabularyIds(frontendVocabulary, "frontends");
  const functionIds = vocabularyIds(functionVocabulary, "primary_functions");
  const capabilityIds = vocabularyIds(capabilityVocabulary, "capabilities");
  const ids = new Set();
  const sources = new Set();
  const errors = [];

  if (!validateRefreshManifest(refreshManifest)) {
    errors.push(
      ...validateRefreshManifest.errors.map((error) =>
        schemaError({ id: "github-refresh" }, error),
      ),
    );
  }

  for (const record of records) {
    if (!validateRecord(record)) {
      errors.push(
        ...validateRecord.errors.map((error) => schemaError(record, error)),
      );
    }

    const id = record.id ?? "<unknown>";
    if (ids.has(id)) {
      errors.push(`${id}: duplicate project id`);
    }
    ids.add(id);

    if (record.source?.type === "github") {
      const repositoryId = record.source.repository_id;
      if (
        record.metadata_status === "curated" &&
        (!Number.isInteger(repositoryId) || repositoryId <= 0)
      ) {
        errors.push(
          `${id}: curated GitHub source requires permanent repository_id`,
        );
      } else if (
        repositoryId !== null &&
        (!Number.isInteger(repositoryId) || repositoryId <= 0)
      ) {
        errors.push(`${id}: GitHub repository_id must be null or positive`);
      }
    } else if (record.source?.type === "github-organization") {
      if (id !== approvedOrganizationRecord.id) {
        errors.push(
          `${id}: github-organization is reserved for tavern-rpg-suite`,
        );
      }
      if (
        record.source.organization !== approvedOrganizationRecord.organization
      ) {
        errors.push(
          `${id}: github-organization organization must be ${approvedOrganizationRecord.organization}`,
        );
      }
      if (record.source.url !== approvedOrganizationRecord.url) {
        errors.push(
          `${id}: github-organization url must be ${approvedOrganizationRecord.url}`,
        );
      }
      if (
        record.kind !== "extension" ||
        record.refresh_policy !== "paused" ||
        record.enrichment_policy !== "manual" ||
        record.enrichment_note !==
          "Multi-repository suite; requires manual curation."
      ) {
        errors.push(
          `${id}: github-organization requires paused extension with manual enrichment policy`,
        );
      }
    } else if (record.source?.type === "url") {
      let protocol;
      try {
        protocol = new URL(record.source.url).protocol;
      } catch {
        protocol = null;
      }
      if (protocol !== "https:") {
        errors.push(`${id}: URL source requires https protocol`);
      }
      if (record.kind !== "preset") {
        errors.push(`${id}: only presets may use source.type url`);
      }
    }

    const repositoryBacked =
      record.source?.type === "github" ||
      (record.id === approvedOrganizationRecord.id &&
        record.source?.type === "github-organization");

    if (
      (record.kind === "frontend" || record.kind === "extension") &&
      !repositoryBacked
    ) {
      errors.push(`${id}: ${record.kind} requires a GitHub source`);
    }

    if (record.source) {
      const canonicalSource = sourceKey(record.source);
      if (sources.has(canonicalSource)) {
        errors.push(`${id}: duplicate canonical source`);
      }
      sources.add(canonicalSource);
    }

    for (const frontend of record.frontends ?? []) {
      if (!frontendIds.has(frontend)) {
        errors.push(`${id}: unknown frontend ${frontend}`);
      }
    }
    if (record.primary_function && !functionIds.has(record.primary_function)) {
      errors.push(`${id}: unknown primary function ${record.primary_function}`);
    }
    for (const capability of record.capabilities ?? []) {
      if (!capabilityIds.has(capability)) {
        errors.push(`${id}: unknown capability ${capability}`);
      }
    }
  }

  const recordsById = new Map(records.map((record) => [record.id, record]));
  for (const snapshot of snapshots) {
    const validSnapshotShape = validateSnapshot(snapshot);
    if (!validSnapshotShape) {
      errors.push(
        ...validateSnapshot.errors.map((error) =>
          schemaError({ id: snapshot.project_id }, error),
        ),
      );
    } else {
      errors.push(...validateSnapshotEvidence(snapshot));
    }
    const record = recordsById.get(snapshot.project_id);
    if (!record) {
      errors.push(`${snapshot.project_id}: snapshot has no curated record`);
    } else if (record.source.type !== "github") {
      errors.push(`${snapshot.project_id}: URL source cannot have a snapshot`);
    } else if (
      snapshot.source_health !== "identity-change" &&
      record.source.repository_id !== null &&
      snapshot.repository?.id !== record.source.repository_id
    ) {
      errors.push(
        `${snapshot.project_id}: snapshot repository id does not match curated identity`,
      );
    }
  }

  errors.push(
    ...(await validateKitData({
      kitRecords,
      projectRecords: records,
      supportSnapshots,
      blockedUsers,
    })),
  );

  return {
    projectCount: records.length,
    snapshotCount: snapshots.length,
    kitCount: kitRecords.length,
    kitSnapshotCount: supportSnapshots.length,
    errors,
  };
}

async function main() {
  const result = await validateCatalog();
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `Validated ${result.projectCount} projects and ${result.kitCount} Kits`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
