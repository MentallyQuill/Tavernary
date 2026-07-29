import { fingerprintProjectRecord } from "../../src/features/help/project-owner-record.mjs";

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function unauthorized(reasonCode) {
  return { authorized: false, reasonCode };
}

export function verifyProjectOwnerAuthority(input) {
  const source = input?.record?.source;
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

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function operationFieldValue(operation, record, field) {
  if (operation === "move-source") return record?.source?.[field];
  return record?.[field];
}

function changedManifestFields(manifest) {
  const original = manifest?.original;
  const proposed = manifest?.proposed;
  if (!original || !proposed) return [];

  if (manifest.operation === "edit-card") {
    return [
      "name",
      "summary",
      "frontends",
      "primary_function",
      "capabilities",
      "model_families",
      "completion_formats",
    ].filter((field) => !valuesEqual(original[field], proposed[field]));
  }
  if (manifest.operation === "move-source") {
    return ["repository", "repository_id"].filter(
      (field) => !valuesEqual(original[field], proposed[field]),
    );
  }
  if (manifest.operation === "delist") {
    return Object.keys(original).filter(
      (field) => !valuesEqual(original[field], proposed[field]),
    );
  }
  return [];
}

export function detectOwnerRequestConflict(input) {
  const { manifest, record } = input ?? {};
  const fields = changedManifestFields(manifest);
  const staleFields = fields.filter(
    (field) =>
      !valuesEqual(
        operationFieldValue(manifest?.operation, record, field),
        manifest?.original?.[field],
      ),
  );
  if (staleFields.length > 0) {
    return {
      conflict: true,
      reasonCode: "stale-owner-request",
      fields: staleFields,
      warnings: [],
    };
  }

  const currentFingerprint =
    input?.currentFingerprint ?? fingerprintProjectRecord(record);
  return {
    conflict: false,
    warnings:
      currentFingerprint === manifest?.source_fingerprint
        ? []
        : ["source-fingerprint-changed"],
  };
}
