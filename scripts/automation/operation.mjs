import { createHash } from "node:crypto";
import Ajv from "ajv";
import {
  AUTOMATION_FAILURE_REASON_CODES,
  AUTOMATION_FAILURE_REASON_KINDS,
} from "./failure.mjs";

export const AUTOMATION_KINDS = [
  "project",
  "owner-request",
  "kit",
  "withdrawal",
  "refresh",
  "report-import",
  "metadata",
  "enrichment",
  "advisory",
  "deployment",
  "dependency",
  "runtime",
  "restore",
  "retention",
  "health",
];
export const AUTOMATION_STAGES = [
  "discovered",
  "admitted",
  "generated",
  "validated",
  "published",
  "deployment-requested",
  "deployment-confirmed",
  "finalized",
];

const identitySchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "subject", "inputDigest", "policyVersion"],
  properties: {
    kind: { enum: AUTOMATION_KINDS },
    subject: {
      type: "string",
      pattern:
        "^(issue|source|report|revision|dependency|runtime|maintenance):[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$",
    },
    inputDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    policyVersion: {
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    },
  },
};
const validateIdentity = new Ajv().compile(identitySchema);

export const AUTOMATION_OPERATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "key",
    "identity",
    "stage",
    "createdAt",
    "nextEligibleAt",
    "expectedSha",
    "workerRunId",
    "retry",
  ],
  properties: {
    key: { type: "string", pattern: "^[a-f0-9]{64}$" },
    identity: identitySchema,
    stage: { enum: AUTOMATION_STAGES },
    createdAt: { type: "string", format: "automation-time" },
    nextEligibleAt: {
      anyOf: [{ type: "string", format: "automation-time" }, { type: "null" }],
    },
    expectedSha: {
      anyOf: [{ type: "string", pattern: "^[a-f0-9]{40}$" }, { type: "null" }],
    },
    workerRunId: {
      anyOf: [
        { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
        { type: "null" },
      ],
    },
    retry: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["failure", "transientAttempts", "immediateAttempts"],
          properties: {
            failure: {
              type: "object",
              additionalProperties: false,
              required: ["kind", "reasonCode"],
              properties: {
                kind: {
                  enum: [
                    "transient",
                    "configuration",
                    "permanent",
                    "superseded",
                    "unknown",
                  ],
                },
                reasonCode: { enum: AUTOMATION_FAILURE_REASON_CODES },
              },
            },
            transientAttempts: {
              type: "integer",
              minimum: 0,
              maximum: Number.MAX_SAFE_INTEGER,
            },
            immediateAttempts: {
              type: "integer",
              minimum: 0,
              maximum: Number.MAX_SAFE_INTEGER,
            },
          },
        },
      ],
    },
  },
};

export function automationSchemaValidator(schema) {
  const validator = new Ajv();
  validator.addFormat("automation-time", (value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value;
  });
  return validator.compile(schema);
}

const validateOperationSchema = automationSchemaValidator(
  AUTOMATION_OPERATION_SCHEMA,
);

export function validateAutomationOperation(value) {
  if (
    !validateOperationSchema(value) ||
    value.key !== operationKey(value.identity) ||
    (value.retry &&
      AUTOMATION_FAILURE_REASON_KINDS[value.retry.failure.reasonCode] !==
        value.retry.failure.kind)
  ) {
    throw new Error("Automation operation is invalid.");
  }
  return value;
}

export function operationKey(identity) {
  if (!validateIdentity(identity))
    throw new Error("Automation identity is invalid.");
  return createHash("sha256")
    .update(
      JSON.stringify([
        identity.kind,
        identity.subject,
        identity.inputDigest,
        identity.policyVersion,
      ]),
    )
    .digest("hex");
}

export function selectDueOperations(operations, { nowMs, limit = 20 }) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(new Date(nowMs).getTime()))
    throw new Error("Automation clock is invalid.");
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new Error("Automation limit is invalid.");
  const validated = operations.map(validateAutomationOperation);
  const blockedKeys = new Set(
    validated
      .filter(
        (operation) =>
          operation.workerRunId !== null ||
          operation.stage === "finalized" ||
          (operation.identity.kind !== "deployment" &&
            ["published", "deployment-requested"].includes(operation.stage)) ||
          operation.retry?.failure.kind === "permanent",
      )
      .map((operation) => operation.key),
  );
  const candidates = validated
    .filter(
      (operation) =>
        !blockedKeys.has(operation.key) &&
        operation.retry?.failure.kind !== "permanent" &&
        (operation.nextEligibleAt === null ||
          Date.parse(operation.nextEligibleAt) <= nowMs),
    )
    .sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
        left.key.localeCompare(right.key),
    );
  const subjects = new Set();
  const selected = [];
  for (const candidate of candidates) {
    if (selected.length >= Math.min(limit, 20)) break;
    if (subjects.has(candidate.identity.subject)) continue;
    subjects.add(candidate.identity.subject);
    selected.push(candidate);
  }
  return selected;
}
