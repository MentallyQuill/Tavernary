import {
  fingerprintProjectRecord,
  fingerprintSourceRecord,
} from "../../src/features/help/project-owner-record.mjs";

const PROJECT_OPERATIONS = new Set([
  "edit-card",
  "retire-card",
  "restore-card",
]);
const SOURCE_OPERATIONS = new Set([
  "add-cards",
  "move-source",
  "delist-source",
]);

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function unauthorized(reasonCode) {
  return { authorized: false, reasonCode };
}

export function verifyProjectOwnerAuthority(input) {
  const source = input?.source;
  if (source?.type !== "github") return unauthorized("unsupported-source");

  const storedRepositoryId = source.repository_id;
  const manifestRepositoryId = input?.manifestRepositoryId;
  const apiRepositoryId = input?.repository?.id;
  if (
    !positiveInteger(storedRepositoryId) ||
    !positiveInteger(manifestRepositoryId) ||
    !positiveInteger(apiRepositoryId)
  ) {
    return unauthorized("missing-repository-identity");
  }
  if (
    storedRepositoryId !== manifestRepositoryId ||
    storedRepositoryId !== apiRepositoryId
  ) {
    return unauthorized("repository-identity-mismatch");
  }

  if (input.repository?.visibility !== "public") {
    return unauthorized("repository-not-public");
  }
  const owner = input.repository?.owner;
  if (owner?.type !== "User" || typeof owner.login !== "string") {
    return unauthorized("repository-owner-not-user");
  }
  if (
    typeof input?.issueAuthor !== "string" ||
    input.issueAuthor.toLocaleLowerCase() !== owner.login.toLocaleLowerCase()
  ) {
    return unauthorized("issue-author-not-owner");
  }
  return {
    authorized: true,
    authorityType: "repository-owner",
    actorLogin: input.issueAuthor,
    ownerLogin: owner.login,
  };
}

function stale(field) {
  return {
    conflict: true,
    reasonCode: "stale-owner-request",
    fields: [field],
    warnings: [],
  };
}

export function detectOwnerRequestConflict(input) {
  const operation = input?.manifest?.operation;
  if (PROJECT_OPERATIONS.has(operation)) {
    const current =
      input?.currentProjectFingerprint ??
      fingerprintProjectRecord(input?.project);
    return current === input?.manifest?.project_fingerprint
      ? { conflict: false, warnings: [] }
      : stale("project_fingerprint");
  }
  if (SOURCE_OPERATIONS.has(operation)) {
    const current =
      input?.currentSourceFingerprint ?? fingerprintSourceRecord(input?.source);
    return current === input?.manifest?.source_fingerprint
      ? { conflict: false, warnings: [] }
      : stale("source_fingerprint");
  }
  return {
    conflict: true,
    reasonCode: "unsupported-owner-operation",
    fields: ["operation"],
    warnings: [],
  };
}
