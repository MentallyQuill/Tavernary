import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv from "ajv";

import { classificationError } from "../../src/features/catalog/primary-function-contract.mjs";
import { repositorySourceId } from "../../src/features/catalog/source-record.mjs";
import { validateKitData } from "../kits/validation.mjs";
import { validateTrustedEditorRegistry } from "../maintenance/trusted-editor-authority.mjs";
import { validateTagVocabulary } from "./tag-vocabulary.mjs";

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
  const [github, codeberg] = await Promise.all([
    loadJsonDirectory("data/snapshots/github"),
    loadJsonDirectory("data/snapshots/codeberg"),
  ]);
  return [...github, ...codeberg];
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

function schemaError(record, error) {
  const location = error.instancePath || "/";
  return `${record.id ?? "<unknown>"}: schema ${location} ${error.message}`;
}

function validateSnapshotEvidence(snapshot) {
  const id = snapshot.source_id ?? snapshot.project_id;
  const { activity, repository } = snapshot;
  const errors = [];

  if (repository.parent?.id === repository.id) {
    errors.push(`${id}: repository cannot be its own fork parent`);
  }
  if (repository.parent && repository.fork !== true) {
    errors.push(`${id}: non-fork repository cannot have a fork parent`);
  }

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
    sourceSchema,
    snapshotSchema,
    refreshManifestSchema,
    frontendVocabulary,
    functionVocabulary,
    modelFamilyVocabulary,
    completionFormatVocabulary,
    tagVocabularySchema,
    tagVocabulary,
    trustedEditorSchema,
    policyReviewSchema,
  ] = await Promise.all([
    readJson("data/schemas/project.schema.json"),
    readJson("data/schemas/source.schema.json"),
    readJson("data/schemas/repository-snapshot.schema.json"),
    readJson("data/schemas/github-refresh.schema.json"),
    readJson("data/vocabularies/frontends.json"),
    readJson("data/vocabularies/primary-functions.json"),
    readJson("data/vocabularies/model-families.json"),
    readJson("data/vocabularies/completion-formats.json"),
    readJson("data/schemas/tag-vocabulary.schema.json"),
    options.tagVocabulary ?? readJson("data/vocabularies/tags.json"),
    readJson("data/schemas/trusted-tavernary-editors.schema.json"),
    readJson("data/schemas/catalog-policy-review.schema.json"),
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
  const validateSource = ajv.compile(sourceSchema);
  const validateSnapshot = ajv.compile(snapshotSchema);
  const validateRefreshManifest = ajv.compile(refreshManifestSchema);
  const validateTagVocabularySchema = ajv.compile(tagVocabularySchema);
  const validateTrustedEditors = ajv.compile(trustedEditorSchema);
  const validatePolicyReview = ajv.compile(policyReviewSchema);
  const records = options.records ?? (await loadRecords());
  const sourceRecords =
    options.sources ??
    (options.records ? [] : await loadJsonDirectory("data/registry/sources"));
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
  const trustedEditors =
    options.trustedEditors ??
    (await readJson("data/maintenance/trusted-tavernary-editors.json"));
  const policyReviewStates =
    options.policyReviewStates ??
    (options.records
      ? []
      : await loadJsonDirectory("data/snapshots/policy-review"));
  const frontendIds = vocabularyIds(frontendVocabulary, "frontends");
  const functionIds = vocabularyIds(functionVocabulary, "primary_functions");
  const modelFamilyIds = vocabularyIds(modelFamilyVocabulary, "model_families");
  const completionFormatIds = vocabularyIds(
    completionFormatVocabulary,
    "completion_formats",
  );
  const tagDefinitions = new Map(
    tagVocabulary.tags.map((tag) => [tag.id, tag]),
  );
  const ids = new Set();
  const sourceIds = new Set();
  const sourceRecordsById = new Map();
  const errors = [];

  const tagVocabularySchemaValid = validateTagVocabularySchema(tagVocabulary);
  if (!tagVocabularySchemaValid) {
    errors.push(
      ...validateTagVocabularySchema.errors.map((error) =>
        schemaError({ id: "tags-vocabulary" }, error),
      ),
    );
  } else {
    const tagVocabularyValidation = validateTagVocabulary(tagVocabulary);
    if (!tagVocabularyValidation.valid) {
      errors.push(
        ...tagVocabularyValidation.errors.map(
          (error) => `tags-vocabulary: ${error}`,
        ),
      );
    }
  }

  const projectSchemaVersions = new Set(
    records.map(({ schema_version: version }) => version),
  );
  if (projectSchemaVersions.size > 1) {
    errors.push("catalog: mixed project schema versions are not allowed");
  }

  const sourceRepositoryIds = new Set();
  for (const source of sourceRecords) {
    if (!validateSource(source)) {
      errors.push(
        ...validateSource.errors.map((error) => schemaError(source, error)),
      );
    }
    const id = source.id ?? "<unknown>";
    if (sourceIds.has(id)) {
      errors.push(`${id}: duplicate source id`);
    }
    sourceIds.add(id);
    sourceRecordsById.set(id, source);

    if (source.type === "github" || source.type === "codeberg") {
      const repositoryKey = `${source.type}:${source.repository_id}`;
      if (sourceRepositoryIds.has(repositoryKey)) {
        errors.push(
          `${id}: duplicate ${source.type} repository_id ${source.repository_id}`,
        );
      }
      sourceRepositoryIds.add(repositoryKey);
      if (
        Number.isSafeInteger(source.repository_id) &&
        source.repository_id > 0 &&
        id !== repositorySourceId(source.type, source.repository_id)
      ) {
        errors.push(
          `${id}: source id does not match immutable repository identity`,
        );
      }
    } else if (source.type === "github-organization") {
      if (
        source.organization !== approvedOrganizationRecord.organization ||
        source.url !== approvedOrganizationRecord.url
      ) {
        errors.push(
          `${id}: github-organization must identify ${approvedOrganizationRecord.url}`,
        );
      }
    } else if (source.type === "url") {
      let protocol;
      try {
        protocol = new URL(source.url).protocol;
      } catch {
        protocol = null;
      }
      if (protocol !== "https:") {
        errors.push(`${id}: URL source requires https protocol`);
      }
    }
  }

  for (const state of policyReviewStates) {
    if (!validatePolicyReview(state)) {
      errors.push(
        ...validatePolicyReview.errors.map((error) =>
          schemaError(
            { id: state?.project_id ?? "catalog-policy-review" },
            error,
          ),
        ),
      );
    }
  }

  if (!validateRefreshManifest(refreshManifest)) {
    errors.push(
      ...validateRefreshManifest.errors.map((error) =>
        schemaError({ id: "github-refresh" }, error),
      ),
    );
  }
  if (!validateTrustedEditors(trustedEditors)) {
    errors.push(
      ...validateTrustedEditors.errors.map((error) =>
        schemaError({ id: "trusted-tavernary-editors" }, error),
      ),
    );
  }
  const trustedEditorValidation = validateTrustedEditorRegistry(trustedEditors);
  if (!trustedEditorValidation.valid) {
    errors.push(
      ...trustedEditorValidation.errors.map(
        (error) => `trusted-tavernary-editors: ${error}`,
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
    const recordSource = sourceRecordsById.get(record.source_id);
    if (!recordSource) {
      errors.push(`${id}: source ${record.source_id} does not exist`);
    }

    const repositoryBacked =
      recordSource?.type === "github" ||
      recordSource?.type === "codeberg" ||
      (record.id === approvedOrganizationRecord.id &&
        recordSource?.type === "github-organization");

    if (record.kind === "extension" && !repositoryBacked) {
      errors.push(`${id}: extension requires a GitHub or Codeberg source`);
    }
    if (
      record.kind === "frontend" &&
      !repositoryBacked &&
      recordSource?.type !== "url"
    ) {
      errors.push(`${id}: frontend requires a GitHub, Codeberg, or URL source`);
    }

    for (const frontend of record.frontends ?? []) {
      if (!frontendIds.has(frontend)) {
        errors.push(`${id}: unknown frontend ${frontend}`);
      }
    }
    const classificationIssue = classificationError(
      record.kind,
      record.primary_function,
    );
    if (classificationIssue) {
      errors.push(`${id}: classification ${classificationIssue}`);
    }
    if (record.primary_function && !functionIds.has(record.primary_function)) {
      errors.push(`${id}: unknown primary function ${record.primary_function}`);
    }
    for (const tagId of record.tags ?? []) {
      const tag = tagDefinitions.get(tagId);
      if (!tag) {
        errors.push(`${id}: unknown tag ${tagId}`);
      } else if (!tag.applicable_kinds.includes(record.kind)) {
        errors.push(`${id}: tag ${tagId} does not apply to ${record.kind}`);
      }
    }
    for (const family of record.model_families ?? []) {
      if (!modelFamilyIds.has(family)) {
        errors.push(`${id}: unknown model family ${family}`);
      }
    }
    for (const format of record.completion_formats ?? []) {
      if (!completionFormatIds.has(format)) {
        errors.push(`${id}: unknown completion format ${format}`);
      }
    }
  }

  const snapshotIds = new Set();
  for (const snapshot of snapshots) {
    const snapshotId = snapshot.source_id;
    if (snapshotIds.has(snapshotId)) {
      errors.push(`${snapshotId}: duplicate repository snapshot`);
    }
    snapshotIds.add(snapshotId);
    const validSnapshotShape = validateSnapshot(snapshot);
    if (!validSnapshotShape) {
      errors.push(
        ...validateSnapshot.errors.map((error) =>
          schemaError({ id: snapshotId }, error),
        ),
      );
    } else {
      errors.push(...validateSnapshotEvidence(snapshot));
    }
    const source = sourceRecordsById.get(snapshot.source_id);
    if (!source) {
      errors.push(`${snapshot.source_id}: snapshot has no source record`);
    } else if (source.type !== "github" && source.type !== "codeberg") {
      errors.push(`${snapshotId}: URL source cannot have a snapshot`);
    } else if (snapshot.provider !== source.type) {
      errors.push(
        `${snapshotId}: snapshot provider does not match record source`,
      );
    } else if (
      snapshot.source_health !== "identity-change" &&
      source.repository_id !== null &&
      snapshot.repository?.id !== source.repository_id
    ) {
      errors.push(
        `${snapshotId}: snapshot repository id does not match curated identity`,
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
