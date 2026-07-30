import { createHash } from "node:crypto";

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const LOGIN_PATTERN = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/u;
const BOT_LOGIN_PATTERN = /^[A-Za-z0-9-]{1,100}\[bot\]$/u;
const SHA1_PATTERN = /^[a-f0-9]{40}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const POLICY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const OPERATIONS = new Set([
  "create",
  "edit-card",
  "add-cards",
  "retire-card",
  "restore-card",
  "move-source",
  "delist-source",
]);
const CARD_OPERATIONS = new Set(["edit-card", "retire-card", "restore-card"]);
const SOURCE_OPERATIONS = new Set([
  "add-cards",
  "move-source",
  "delist-source",
]);
const PRODUCERS = new Set(["project-submission", "project-owner-request"]);
const PUBLICATION_MODES = new Set(["automatic", "manual"]);
const AUTHORITIES = new Set([
  "community-submitter",
  "repository-owner",
  "tavernary-staff",
]);
const SOURCE_TYPES = new Set(["github", "codeberg", "reddit", "external"]);
const COPY_MODES = new Set(["preserve", "synthesize"]);
const COPY_RESULTS = new Set([
  "accepted-unchanged",
  "accepted-with-light-edits",
  "accepted-with-policy-rewrite",
]);
const COPY_SIGNALS = new Set(["none", "catalog-policy-rewrite"]);
const COPY_REASONS = new Set([
  "emoji-removed",
  "whitespace-normalized",
  "punctuation-corrected",
  "obvious-spelling-corrected",
  "graphic-wording-neutralized",
  "slur-removed",
  "discriminatory-framing-neutralized",
]);

export const PROJECT_PUBLICATION_TRANSACTION_MARKER =
  "<!-- tavernary-project-publication-transaction";

const transactionKeys = new Set([
  "schema_version",
  "operation",
  "producer",
  "publication_mode",
  "issue_number",
  "project_ids",
  "source_id",
  "source_identity",
  "actor",
  "authority_type",
  "input_digest",
  "input_fingerprints",
  "base_sha",
  "generated_head_sha",
  "generated_paths",
  "policy_version",
  "copy_result",
]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function fingerprintProjectPublicationInput(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)), "utf8")
    .digest("hex");
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.size &&
    Object.keys(value).every((key) => keys.has(key))
  );
}

function sortedUnique(values) {
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.every((value) => typeof value === "string") &&
    new Set(values).size === values.length &&
    values.every(
      (value, index) =>
        index === 0 || values[index - 1].localeCompare(value) < 0,
    )
  );
}

function validSourceIdentity(identity) {
  if (
    !exactKeys(identity, new Set(["type", "canonical", "repository_id"])) ||
    !SOURCE_TYPES.has(identity.type) ||
    typeof identity.canonical !== "string" ||
    identity.canonical.length < 1 ||
    identity.canonical.length > 320 ||
    /[\u0000-\u001f\u007f]/u.test(identity.canonical)
  ) {
    return false;
  }
  return (
    identity.repository_id === null ||
    (Number.isSafeInteger(identity.repository_id) && identity.repository_id > 0)
  );
}

function sourceIdentityMatchesId(identity, sourceId) {
  if (identity === null) return true;
  if (identity.type === "github" || identity.type === "codeberg") {
    return (
      identity.repository_id !== null &&
      sourceId === `${identity.type}-${identity.repository_id}`
    );
  }
  return sourceId.startsWith("url-");
}

function validActor(actor) {
  return (
    exactKeys(actor, new Set(["id", "login", "type"])) &&
    Number.isSafeInteger(actor.id) &&
    actor.id > 0 &&
    typeof actor.login === "string" &&
    ((actor.type === "User" && LOGIN_PATTERN.test(actor.login)) ||
      (actor.type === "Bot" && BOT_LOGIN_PATTERN.test(actor.login)))
  );
}

function validCopyResult(copyResult) {
  if (copyResult === null) return true;
  if (
    !exactKeys(
      copyResult,
      new Set(["mode", "result", "change_reasons", "policy_signal"]),
    ) ||
    !COPY_MODES.has(copyResult.mode) ||
    !COPY_RESULTS.has(copyResult.result) ||
    !COPY_SIGNALS.has(copyResult.policy_signal) ||
    !Array.isArray(copyResult.change_reasons) ||
    copyResult.change_reasons.length > 8 ||
    copyResult.change_reasons.some((reason) => !COPY_REASONS.has(reason)) ||
    new Set(copyResult.change_reasons).size !== copyResult.change_reasons.length
  ) {
    return false;
  }
  if (
    (copyResult.result === "accepted-unchanged") !==
    (copyResult.change_reasons.length === 0)
  ) {
    return false;
  }
  return (
    (copyResult.policy_signal === "catalog-policy-rewrite") ===
    (copyResult.result === "accepted-with-policy-rewrite")
  );
}

function operationProducerValid(operation, producer) {
  return operation === "create"
    ? producer === "project-submission"
    : producer === "project-owner-request";
}

function authorityValid(operation, authority) {
  return operation === "create"
    ? AUTHORITIES.has(authority)
    : authority === "repository-owner" || authority === "tavernary-staff";
}

function projectIdsValid(transaction) {
  if (
    !sortedUnique(transaction.project_ids) ||
    transaction.project_ids.some((id) => !PROJECT_ID_PATTERN.test(id))
  ) {
    return false;
  }
  if (transaction.operation === "add-cards") {
    return transaction.project_ids.length <= 10;
  }
  if (
    transaction.operation === "create" ||
    CARD_OPERATIONS.has(transaction.operation)
  ) {
    return transaction.project_ids.length === 1;
  }
  return transaction.project_ids.length <= 1_000;
}

function inputFingerprintsValid(transaction) {
  const value = transaction.input_fingerprints;
  if (!exactKeys(value, new Set(["projects", "source"]))) return false;
  const projects = value.projects;
  if (
    projects === null ||
    typeof projects !== "object" ||
    Array.isArray(projects)
  ) {
    return false;
  }
  const projectIds = Object.keys(projects);
  if (
    projectIds.some(
      (id) =>
        !PROJECT_ID_PATTERN.test(id) || !SHA256_PATTERN.test(projects[id]),
    ) ||
    projectIds.some(
      (id, index) => index > 0 && projectIds[index - 1].localeCompare(id) >= 0,
    )
  ) {
    return false;
  }
  if (transaction.operation === "create") {
    return projectIds.length === 0 && value.source === null;
  }
  if (CARD_OPERATIONS.has(transaction.operation)) {
    return (
      projectIds.length === 1 &&
      projectIds[0] === transaction.project_ids[0] &&
      value.source === null
    );
  }
  return projectIds.length === 0 && SHA256_PATTERN.test(value.source ?? "");
}

function repositorySnapshotPath(sourceId) {
  if (sourceId.startsWith("github-")) {
    return `data/snapshots/github/${sourceId}.json`;
  }
  if (sourceId.startsWith("codeberg-")) {
    return `data/snapshots/codeberg/${sourceId}.json`;
  }
  return null;
}

function derivedPaths(transaction) {
  const cardPaths = transaction.project_ids.map(
    (id) => `data/registry/projects/${id}.json`,
  );
  const sourcePath = `data/registry/sources/${transaction.source_id}.json`;
  const snapshotPath = repositorySnapshotPath(transaction.source_id);
  if (transaction.operation === "create") {
    return [
      ...cardPaths,
      sourcePath,
      ...(snapshotPath ? [snapshotPath] : []),
      ...(transaction.generated_paths.includes(
        "data/vocabularies/frontends.json",
      )
        ? ["data/vocabularies/frontends.json"]
        : []),
    ].sort((left, right) => left.localeCompare(right));
  }
  if (CARD_OPERATIONS.has(transaction.operation)) return cardPaths;
  if (transaction.operation === "add-cards") return cardPaths;
  if (transaction.operation === "move-source") {
    return [sourcePath, ...(snapshotPath ? [snapshotPath] : [])].sort(
      (left, right) => left.localeCompare(right),
    );
  }
  return [sourcePath];
}

function validateTransaction(value) {
  if (
    !exactKeys(value, transactionKeys) ||
    value.schema_version !== 2 ||
    !OPERATIONS.has(value.operation) ||
    !PRODUCERS.has(value.producer) ||
    !PUBLICATION_MODES.has(value.publication_mode) ||
    !operationProducerValid(value.operation, value.producer) ||
    !Number.isSafeInteger(value.issue_number) ||
    value.issue_number < 1 ||
    !SOURCE_ID_PATTERN.test(value.source_id) ||
    !validActor(value.actor) ||
    !authorityValid(value.operation, value.authority_type) ||
    !SHA256_PATTERN.test(value.input_digest) ||
    !SHA1_PATTERN.test(value.base_sha) ||
    !SHA1_PATTERN.test(value.generated_head_sha) ||
    !POLICY_VERSION_PATTERN.test(value.policy_version) ||
    !validCopyResult(value.copy_result) ||
    !projectIdsValid(value) ||
    !inputFingerprintsValid(value)
  ) {
    return false;
  }
  if (
    (value.source_identity !== null &&
      !validSourceIdentity(value.source_identity)) ||
    !sourceIdentityMatchesId(value.source_identity, value.source_id) ||
    (value.operation === "create" && value.source_identity === null) ||
    (value.source_identity === null &&
      value.authority_type !== "tavernary-staff")
  ) {
    return false;
  }
  if (
    (value.operation === "add-cards" && value.publication_mode !== "manual") ||
    (value.operation === "create" && value.publication_mode !== "automatic")
  ) {
    return false;
  }
  if (
    value.operation === "create" &&
    value.authority_type === "community-submitter" &&
    value.copy_result !== null &&
    value.copy_result.mode !== "synthesize"
  ) {
    return false;
  }
  if (
    !Array.isArray(value.generated_paths) ||
    value.generated_paths.length < 1 ||
    new Set(value.generated_paths).size !== value.generated_paths.length
  ) {
    return false;
  }
  return (
    JSON.stringify(value.generated_paths) ===
    JSON.stringify(derivedPaths(value))
  );
}

export function createProjectPublicationTransaction(input) {
  const candidate = {
    schema_version: 2,
    operation: input?.operation,
    producer: input?.producer,
    publication_mode: input?.publication_mode,
    issue_number: input?.issue_number,
    project_ids: Array.isArray(input?.project_ids)
      ? [...input.project_ids]
      : input?.project_ids,
    source_id: input?.source_id,
    source_identity: input?.source_identity,
    actor: input?.actor,
    authority_type: input?.authority_type,
    input_digest: input?.input_digest,
    input_fingerprints:
      input?.input_fingerprints &&
      typeof input.input_fingerprints === "object" &&
      !Array.isArray(input.input_fingerprints)
        ? {
            projects: { ...(input.input_fingerprints.projects ?? {}) },
            source: input.input_fingerprints.source,
          }
        : input?.input_fingerprints,
    base_sha: input?.base_sha,
    generated_head_sha: input?.generated_head_sha,
    generated_paths: Array.isArray(input?.generated_paths)
      ? [...input.generated_paths]
      : input?.generated_paths,
    policy_version: input?.policy_version,
    copy_result: input?.copy_result,
  };
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (input.schema_version !== undefined && input.schema_version !== 2) ||
    Object.keys(input).some(
      (key) => key !== "schema_version" && !transactionKeys.has(key),
    ) ||
    !validateTransaction(candidate)
  ) {
    throw new Error(
      "Invalid project publication transaction or source identity.",
    );
  }
  return candidate;
}

export function expectedTransactionPaths(transaction) {
  if (!validateTransaction(transaction)) {
    throw new Error("Invalid project publication transaction.");
  }
  return derivedPaths(transaction);
}

export function parseProjectPublicationTransaction(body) {
  if (typeof body !== "string") return null;
  const start = body.indexOf(PROJECT_PUBLICATION_TRANSACTION_MARKER);
  if (
    start < 0 ||
    body.indexOf(
      PROJECT_PUBLICATION_TRANSACTION_MARKER,
      start + PROJECT_PUBLICATION_TRANSACTION_MARKER.length,
    ) >= 0
  ) {
    return null;
  }
  const jsonStart = body.indexOf("\n", start);
  const end = body.indexOf("-->", jsonStart);
  if (jsonStart < 0 || end < 0) return null;
  try {
    return createProjectPublicationTransaction(
      JSON.parse(body.slice(jsonStart, end).trim()),
    );
  } catch {
    return null;
  }
}
