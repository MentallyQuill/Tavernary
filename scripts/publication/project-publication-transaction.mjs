const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const LOGIN_PATTERN = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/u;
const BOT_LOGIN_PATTERN = /^[A-Za-z0-9-]{1,100}\[bot\]$/u;
const SHA1_PATTERN = /^[a-f0-9]{40}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const POLICY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const OPERATIONS = new Set(["create", "edit-card", "move-source", "delist"]);
const PRODUCERS = new Set(["project-submission", "project-owner-request"]);
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
  "issue_number",
  "project_id",
  "source_identity",
  "actor",
  "authority_type",
  "input_digest",
  "record_fingerprint",
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

function allowedPaths(transaction) {
  const registry = `data/registry/projects/${transaction.project_id}.json`;
  if (
    transaction.operation === "edit-card" ||
    transaction.operation === "delist"
  ) {
    return new Set([registry]);
  }
  if (transaction.operation === "move-source") {
    return new Set([
      registry,
      `data/snapshots/github/${transaction.project_id}.json`,
    ]);
  }
  return new Set([
    registry,
    `data/snapshots/github/${transaction.project_id}.json`,
    `data/snapshots/codeberg/${transaction.project_id}.json`,
    "data/vocabularies/frontends.json",
  ]);
}

function validateTransaction(value) {
  if (
    !exactKeys(value, transactionKeys) ||
    value.schema_version !== 1 ||
    !OPERATIONS.has(value.operation) ||
    !PRODUCERS.has(value.producer) ||
    !operationProducerValid(value.operation, value.producer) ||
    !Number.isSafeInteger(value.issue_number) ||
    value.issue_number < 1 ||
    !PROJECT_ID_PATTERN.test(value.project_id) ||
    !validActor(value.actor) ||
    !authorityValid(value.operation, value.authority_type) ||
    !SHA256_PATTERN.test(value.input_digest) ||
    !SHA1_PATTERN.test(value.base_sha) ||
    !SHA1_PATTERN.test(value.generated_head_sha) ||
    !POLICY_VERSION_PATTERN.test(value.policy_version) ||
    !validCopyResult(value.copy_result)
  ) {
    return false;
  }
  if (
    (value.operation === "create" && value.record_fingerprint !== null) ||
    (value.operation !== "create" &&
      !SHA256_PATTERN.test(value.record_fingerprint ?? ""))
  ) {
    return false;
  }
  if (
    value.source_identity === null
      ? !["edit-card", "delist"].includes(value.operation)
      : !validSourceIdentity(value.source_identity)
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
    value.copy_result !== null &&
    ["repository-owner", "tavernary-staff"].includes(value.authority_type) &&
    value.copy_result.mode !== "preserve"
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
  const allowed = allowedPaths(value);
  const registry = `data/registry/projects/${value.project_id}.json`;
  if (
    !value.generated_paths.includes(registry) ||
    value.generated_paths.some((path) => !allowed.has(path))
  ) {
    return false;
  }
  if (value.operation === "move-source" && value.generated_paths.length !== 2) {
    return false;
  }
  return true;
}

export function createProjectPublicationTransaction(input) {
  const candidate = {
    schema_version: 1,
    operation: input?.operation,
    producer: input?.producer,
    issue_number: input?.issue_number,
    project_id: input?.project_id,
    source_identity: input?.source_identity,
    actor: input?.actor,
    authority_type: input?.authority_type,
    input_digest: input?.input_digest,
    record_fingerprint: input?.record_fingerprint,
    base_sha: input?.base_sha,
    generated_head_sha: input?.generated_head_sha,
    generated_paths: Array.isArray(input?.generated_paths)
      ? [...input.generated_paths].sort((left, right) =>
          left.localeCompare(right),
        )
      : input?.generated_paths,
    policy_version: input?.policy_version,
    copy_result: input?.copy_result,
  };
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
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
  return [...transaction.generated_paths].sort((left, right) =>
    left.localeCompare(right),
  );
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
import { createHash } from "node:crypto";
