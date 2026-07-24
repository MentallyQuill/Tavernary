import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv from "ajv";

import { countWords, kitSetKey } from "../../src/features/kits/kit-domain.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function readJson(path) {
  return JSON.parse(await readFile(resolve(rootDirectory, path), "utf8"));
}

function addFormats(ajv) {
  ajv.addFormat(
    "date-time",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,
  );
}

function schemaErrors(prefix, validate, record) {
  if (validate(record)) {
    return [];
  }
  return validate.errors.map((error) => {
    const location = error.instancePath || "/";
    return `${prefix}: schema ${location} ${error.message}`;
  });
}

export async function validateKitData({
  kitRecords,
  projectRecords,
  supportSnapshots,
  blockedUsers,
}) {
  const [kitSchema, supportSchema, blockedSchema] = await Promise.all([
    readJson("data/schemas/kit.schema.json"),
    readJson("data/schemas/kit-support-snapshot.schema.json"),
    readJson("data/schemas/blocked-github-users.schema.json"),
  ]);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validateKit = ajv.compile(kitSchema);
  const validateSupport = ajv.compile(supportSchema);
  const validateBlocked = ajv.compile(blockedSchema);
  const errors = schemaErrors("blocked users", validateBlocked, blockedUsers);
  const projectsById = new Map(
    projectRecords.map((project) => [project.id, project]),
  );
  const kitsById = new Map();
  const setOwners = new Map();

  const blockedIds = new Set();
  for (const blocked of blockedUsers.blocked ?? []) {
    if (blockedIds.has(blocked.github_user_id)) {
      errors.push(
        `blocked user ${blocked.github_user_id}: duplicate GitHub user id`,
      );
    }
    blockedIds.add(blocked.github_user_id);
  }

  for (const kit of kitRecords) {
    const id = kit.id ?? "<unknown>";
    errors.push(...schemaErrors(id, validateKit, kit));
    if (kitsById.has(id)) {
      errors.push(`${id}: duplicate Kit id`);
    } else {
      kitsById.set(id, kit);
    }
    if (
      countWords(kit.description ?? "") < 1 ||
      countWords(kit.description ?? "") > 100
    ) {
      errors.push(`${id}: description must contain 1–100 words`);
    }
    if (kit.status === "withdrawn" && !kit.withdrawn_at) {
      errors.push(`${id}: withdrawn record requires withdrawn_at`);
    }
    for (const projectId of kit.project_ids ?? []) {
      if (!projectsById.has(projectId)) {
        errors.push(`${id}: unknown project ${projectId}`);
      }
    }
    const setKey = kitSetKey(kit.project_ids ?? []);
    const owner = setOwners.get(setKey);
    if (owner) {
      errors.push(`${id}: duplicates the project set of ${owner}`);
    } else if (setKey) {
      setOwners.set(setKey, id);
    }
  }

  const snapshotKitIds = new Set();
  for (const snapshot of supportSnapshots) {
    const id = snapshot.kit_id ?? "<unknown>";
    const supportSchemaErrors = schemaErrors(id, validateSupport, snapshot);
    errors.push(
      ...supportSchemaErrors.map((error) =>
        error.replace(`${id}: schema`, `${id}: support schema`),
      ),
    );
    if (snapshotKitIds.has(id)) {
      errors.push(`${id}: duplicate support snapshot`);
    }
    snapshotKitIds.add(id);
    const kit = kitsById.get(id);
    if (!kit) {
      errors.push(`${id}: support snapshot has no canonical Kit`);
      continue;
    }
    if (snapshot.source_issue_number !== kit.source_issue_number) {
      errors.push(
        `${id}: support source issue does not match canonical record`,
      );
    }
    const supporterIds = new Set();
    for (const supporter of snapshot.supporters ?? []) {
      if (supporterIds.has(supporter.github_user_id)) {
        errors.push(`${id}: duplicate supporter ${supporter.github_user_id}`);
      }
      supporterIds.add(supporter.github_user_id);
      if (blockedIds.has(supporter.github_user_id) && supporter.active) {
        errors.push(
          `${id}: blocked supporter ${supporter.github_user_id} cannot be active`,
        );
      }
    }
  }

  return errors;
}
