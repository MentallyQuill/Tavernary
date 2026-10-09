import { createHash } from "node:crypto";
import {
  automationSchemaValidator,
  validateAutomationOperation,
} from "./operation.mjs";
import { prepareReadmeText } from "../catalog/readme-preparation.mjs";
import { metadataFieldsToGenerate } from "../catalog/metadata-policy.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";

const id = {
  type: "string",
  pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
  maxLength: 200,
};
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" };
export const METADATA_CACHE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "projectId",
    "sourceId",
    "sourceIdentity",
    "inputDigest",
    "fingerprint",
    "vocabularyHash",
    "policyVersion",
    "fields",
    "traitsDigest",
    "outputDigest",
    "headSha",
    "observedAt",
  ],
  properties: {
    schema_version: { const: 1 },
    projectId: id,
    sourceId: id,
    sourceIdentity: {
      type: "string",
      pattern: "^(github|codeberg):[1-9][0-9]*$",
    },
    inputDigest: digest,
    fingerprint: digest,
    vocabularyHash: digest,
    traitsDigest: digest,
    outputDigest: digest,
    policyVersion: {
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    },
    fields: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      uniqueItems: true,
      items: { enum: ["summary", "tags"] },
    },
    headSha: { type: "string", pattern: "^[a-f0-9]{40}$" },
    observedAt: { type: "string", format: "automation-time" },
  },
};
const validCache = automationSchemaValidator(METADATA_CACHE_SCHEMA);
export function validateMetadataCache(value) {
  if (
    !validCache(value) ||
    value.fields.join(",") !== [...value.fields].sort().join(",")
  )
    throw new Error("Metadata cache schema is invalid.");
  return value;
}
export function normalizeMetadataContent({ readme, description }) {
  for (const value of [readme, description]) {
    if (
      value != null &&
      (typeof value !== "string" ||
        Buffer.byteLength(value) > 1048576 ||
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value))
    )
      throw new Error("Metadata source content is invalid.");
  }
  return JSON.stringify({
    readme: prepareReadmeText(readme ?? "", { maxCharacters: 8000 }) ?? "",
    description: String(description ?? "")
      .replace(/\r\n?/gu, "\n")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 500),
  });
}
export function metadataFingerprint({
  sourceId,
  normalizedContent,
  policyVersion,
  vocabularyHash,
}) {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(sourceId ?? "") ||
    typeof normalizedContent !== "string" ||
    Buffer.byteLength(normalizedContent) > 65536 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(policyVersion ?? "") ||
    !/^[a-f0-9]{64}$/u.test(vocabularyHash ?? "")
  )
    throw new Error("Metadata fingerprint input is invalid.");
  return createHash("sha256")
    .update(
      JSON.stringify([
        sourceId,
        normalizedContent,
        policyVersion,
        vocabularyHash,
      ]),
    )
    .digest("hex");
}
export function metadataTraitsDigest(record) {
  return fingerprintProjectPublicationInput({
    name: record.name ?? "",
    kind: record.kind ?? "",
    frontends: [...(record.frontends ?? [])].sort(),
  });
}
export function metadataOutputDigest(
  record,
  fields = metadataFieldsToGenerate(record),
) {
  if (
    !Array.isArray(fields) ||
    !fields.length ||
    new Set(fields).size !== fields.length ||
    fields.some((field) => !["summary", "tags"].includes(field))
  )
    throw new Error("Metadata output fields are invalid.");
  return fingerprintProjectPublicationInput(
    Object.fromEntries(
      [...fields]
        .sort()
        .map((field) => [field, record[field] ?? (field === "tags" ? [] : "")]),
    ),
  );
}
export function createMetadataCache({
  operation,
  record,
  sourceIdentity,
  headSha,
  normalizedContent,
  vocabularyHash,
  nowMs,
}) {
  validateAutomationOperation(operation);
  if (
    operation.identity.kind !== "metadata" ||
    operation.identity.subject !== `source:${record.source_id}:${record.id}` ||
    record.metadata_status !== "curated"
  )
    throw new Error("Metadata cache operation is invalid.");
  return validateMetadataCache({
    schema_version: 1,
    projectId: record.id,
    sourceId: record.source_id,
    sourceIdentity,
    inputDigest: operation.identity.inputDigest,
    fingerprint: metadataFingerprint({
      sourceId: record.source_id,
      normalizedContent,
      policyVersion: operation.identity.policyVersion,
      vocabularyHash,
    }),
    vocabularyHash,
    policyVersion: operation.identity.policyVersion,
    fields: metadataFieldsToGenerate(record).sort(),
    traitsDigest: metadataTraitsDigest(record),
    outputDigest: metadataOutputDigest(record),
    headSha,
    observedAt: new Date(nowMs).toISOString(),
  });
}
export function metadataCacheMatches({
  cache,
  record,
  evidence,
  fields = metadataFieldsToGenerate(record),
}) {
  try {
    validateMetadataCache(cache);
    return (
      cache.projectId === record.id &&
      cache.sourceId === record.source_id &&
      cache.sourceIdentity === evidence.sourceIdentity &&
      cache.policyVersion === evidence.policyVersion &&
      cache.vocabularyHash === evidence.vocabularyHash &&
      cache.fields.join(",") === [...fields].sort().join(",") &&
      cache.traitsDigest === metadataTraitsDigest(record) &&
      cache.outputDigest === metadataOutputDigest(record, fields) &&
      cache.fingerprint ===
        metadataFingerprint({
          sourceId: record.source_id,
          normalizedContent: evidence.normalizedContent,
          policyVersion: evidence.policyVersion,
          vocabularyHash: evidence.vocabularyHash,
        })
    );
  } catch {
    return false;
  }
}
export function selectMetadataRefresh({
  records,
  evidence,
  cache,
  nowMs,
  limit = 10,
}) {
  if (
    !Array.isArray(records) ||
    records.length > 10000 ||
    !Array.isArray(evidence) ||
    !Array.isArray(cache) ||
    !Number.isSafeInteger(nowMs) ||
    !Number.isInteger(limit) ||
    limit < 0 ||
    limit > 10
  )
    throw new Error("Metadata selection input is invalid.");
  const candidates = [],
    cached = [],
    pending = [];
  for (const record of records) {
    const fields = metadataFieldsToGenerate(record).sort();
    if (
      !fields.length ||
      record.visibility === "hidden" ||
      ["delisted", "retired"].includes(record.listing_status)
    )
      continue;
    const source = evidence.find(
      (value) => value.sourceId === record.source_id,
    );
    if (
      !source?.public ||
      !["github", "codeberg"].includes(source.provider) ||
      !/^(github|codeberg):[1-9][0-9]*$/u.test(source.sourceIdentity ?? "")
    )
      continue;
    if (
      source.status !== "ready" ||
      typeof source.normalizedContent !== "string" ||
      !Number.isFinite(Date.parse(source.observedAt)) ||
      Date.parse(source.observedAt) > nowMs + 300000
    ) {
      pending.push({
        projectId: record.id,
        sourceId: record.source_id,
        reason: "source-unavailable",
      });
      continue;
    }
    const entry = {
      projectId: record.id,
      sourceId: record.source_id,
      fields,
      fingerprint: metadataFingerprint({
        sourceId: record.source_id,
        normalizedContent: source.normalizedContent,
        policyVersion: source.policyVersion,
        vocabularyHash: source.vocabularyHash,
      }),
    };
    if (
      cache.some((value) =>
        metadataCacheMatches({
          cache: value,
          record,
          evidence: source,
          fields,
        }),
      )
    )
      cached.push(entry);
    else
      candidates.push({
        entry,
        observedAt: Date.parse(source.observedAt),
        provisional: record.metadata_status !== "curated",
      });
  }
  candidates.sort(
    (a, b) =>
      Number(b.provisional) - Number(a.provisional) ||
      a.observedAt - b.observedAt ||
      a.entry.projectId.localeCompare(b.entry.projectId),
  );
  const selected = candidates
    .slice(0, limit)
    .map((candidate) => candidate.entry);
  return {
    sources: selected,
    cached,
    pending,
    remaining: candidates.length - selected.length,
  };
}
