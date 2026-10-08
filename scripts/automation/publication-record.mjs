import {
  AUTOMATION_OPERATION_SCHEMA,
  automationSchemaValidator,
  validateAutomationOperation,
} from "./operation.mjs";
import { validateAutomationReceipt } from "./receipts.mjs";
import { createHash } from "node:crypto";
export function canonicalGitBlobSha(content) {
  const bytes = Buffer.from(content);
  return createHash("sha1")
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest("hex");
}
const validate = automationSchemaValidator({
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "operation",
    "source",
    "authorId",
    "producer",
    "files",
  ],
  properties: {
    schema_version: { const: 1 },
    operation: AUTOMATION_OPERATION_SCHEMA,
    source: {
      type: "object",
      additionalProperties: false,
      required: ["id", "identity"],
      properties: {
        id: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
        identity: { type: "string", minLength: 1, maxLength: 200 },
      },
    },
    authorId: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    producer: {
      type: "object",
      additionalProperties: false,
      required: ["workflow", "runId", "sourceSha"],
      properties: {
        workflow: {
          type: "string",
          pattern: "^\\.github/workflows/[a-z0-9-]+\\.yml$",
        },
        runId: {
          type: "integer",
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        sourceSha: { type: "string", pattern: "^[a-f0-9]{40}$" },
      },
    },
    files: {
      type: "array",
      minItems: 1,
      maxItems: 128,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "sha256", "gitBlobSha"],
        properties: {
          path: {
            type: "string",
            pattern:
              "^data/(?:registry/(?:projects|sources|kits)|snapshots/(?:github(?:/kits)?|codeberg|install|policy-review)|maintenance/automation/metadata|security)/[a-z0-9]+(?:-[a-z0-9]+)*\\.json$",
          },
          sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          gitBlobSha: { type: "string", pattern: "^[a-f0-9]{40}$" },
        },
      },
    },
  },
});
export function validateCanonicalPublicationRecord(value) {
  if (!validate(value))
    throw new Error("Canonical publication evidence is invalid.");
  validateAutomationOperation(value.operation);
  if (new Set(value.files.map((file) => file.path)).size !== value.files.length)
    throw new Error("Canonical publication evidence has duplicate paths.");
  return value;
}
export function createCanonicalPublicationRecord({ result, operation }) {
  validateAutomationOperation(operation);
  if (
    result.operationKey !== operation.key ||
    result.kind !== operation.identity.kind ||
    result.inputDigest !== operation.identity.inputDigest ||
    result.policyVersion !== operation.identity.policyVersion
  )
    throw new Error(
      "Canonical publication evidence changed operation identity.",
    );
  if (
    result.files.some(
      (file) =>
        typeof file.content !== "string" ||
        Buffer.byteLength(file.content) !== file.bytes ||
        createHash("sha256").update(file.content).digest("hex") !==
          file.sha256 ||
        file.sha256 === file.baseDigest,
    )
  )
    throw new Error(
      "Canonical publication data digest is invalid or unchanged.",
    );
  return validateCanonicalPublicationRecord({
    schema_version: 1,
    operation: {
      ...operation,
      workerRunId: null,
      retry: null,
      nextEligibleAt: null,
    },
    source: result.source,
    authorId: result.authorId,
    producer: result.producer,
    files: result.files.map(({ path, sha256, content }) => ({
      path,
      sha256,
      gitBlobSha: canonicalGitBlobSha(content),
    })),
  });
}
export function discoverCanonicalPublications({
  records,
  fileDigests,
  receipts = [],
  confirmedRevisions = [],
  requestedRevisions = [],
  nowMs,
}) {
  if (!Number.isFinite(nowMs))
    throw new Error("Publication evidence clock is invalid.");
  receipts.forEach(validateAutomationReceipt);
  const seen = new Set();
  const operations = [];
  for (const { record: value, revision } of records) {
    const record = validateCanonicalPublicationRecord(value);
    if (
      !/^[a-f0-9]{40}$/u.test(revision ?? "") ||
      seen.has(record.operation.key)
    )
      throw new Error(
        "Canonical publication revision is invalid or duplicated.",
      );
    seen.add(record.operation.key);
    if (
      record.files.some(
        (file) => fileDigests[`${revision}:${file.path}`] !== file.sha256,
      )
    )
      continue;
    const receipt = receipts.find(
      (receipt) =>
        receipt.operation.key === record.operation.key &&
        receipt.operation.expectedSha === revision,
    );
    const confirmed = confirmedRevisions.includes(revision);
    const stage = confirmed
      ? receipt?.operation.stage === "finalized"
        ? "finalized"
        : "deployment-confirmed"
      : requestedRevisions.includes(revision)
        ? "deployment-requested"
        : "published";
    operations.push(
      validateAutomationOperation({
        ...record.operation,
        stage,
        expectedSha: revision,
        workerRunId: null,
        nextEligibleAt: null,
        retry: null,
      }),
    );
  }
  return operations;
}
