import { createHash } from "node:crypto";
import {
  MODEL_USAGE_SCHEMA,
  validateModelUsageEvidence,
} from "./model-budget.mjs";
import {
  automationSchemaValidator,
  validateAutomationOperation,
} from "./operation.mjs";

const digestSchema = { type: "string", pattern: "^[a-f0-9]{64}$" };
const shaSchema = { type: "string", pattern: "^[a-f0-9]{40}$" };
const kinds = [
  "project",
  "owner-request",
  "kit",
  "withdrawal",
  "refresh",
  "metadata",
  "advisory",
  "report-import",
];
export const PREPARED_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "operationKey",
    "kind",
    "inputDigest",
    "policyVersion",
    "source",
    "authorId",
    "repository",
    "producer",
    "baseSha",
    "files",
  ],
  properties: {
    schema_version: { const: 1 },
    modelUsage: MODEL_USAGE_SCHEMA,
    operationKey: digestSchema,
    kind: { enum: kinds },
    inputDigest: digestSchema,
    policyVersion: {
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["id", "identity"],
      properties: {
        id: {
          type: "string",
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          maxLength: 200,
        },
        identity: {
          type: "string",
          pattern: "^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$",
        },
      },
    },
    authorId: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    repository: {
      type: "string",
      pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",
    },
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
        sourceSha: shaSchema,
      },
    },
    baseSha: shaSchema,
    files: {
      type: "array",
      minItems: 1,
      maxItems: 128,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "type", "content", "sha256", "bytes", "baseDigest"],
        properties: {
          path: { type: "string", minLength: 1, maxLength: 240 },
          type: { const: "file" },
          content: { type: "string", maxLength: 8_388_608 },
          sha256: digestSchema,
          bytes: { type: "integer", minimum: 1, maximum: 8_388_608 },
          baseDigest: { anyOf: [digestSchema, { type: "null" }] },
        },
      },
    },
  },
};
const validate = automationSchemaValidator(PREPARED_RESULT_SCHEMA);
const workflows = {
  project: ["generate-project-submission"],
  "owner-request": ["generate-project-owner-request"],
  kit: ["apply-kit-submission"],
  withdrawal: ["apply-kit-withdrawal"],
  refresh: ["refresh-catalog"],
  metadata: ["enrich-catalog"],
  advisory: ["review-catalog-policy"],
  "report-import": ["import-tavernkeeper-reports"],
};
function fail(code) {
  throw Object.assign(new Error("Prepared result validation failed."), {
    code,
  });
}
function allowedPath(result, path) {
  const slug = "[a-z0-9]+(?:-[a-z0-9]+)*";
  if (path === "data/snapshots/github-refresh.json")
    return result.kind === "refresh";
  if (
    !new RegExp(
      `^data/(?:registry/(?:projects|sources|kits)|snapshots/(?:github(?:/kits)?|codeberg|install|policy-review)|maintenance/automation/metadata|security)/${slug}\\.json$`,
      "u",
    ).test(path)
  )
    return false;
  if (result.kind === "refresh")
    return (
      /^data\/snapshots\/github\/kits\//u.test(path) ||
      ["github", "codeberg", "install"].some(
        (provider) =>
          path === `data/snapshots/${provider}/${result.source.id}.json`,
      )
    );
  if (result.kind === "metadata")
    return (
      path.startsWith("data/registry/projects/") ||
      path ===
        `data/maintenance/automation/metadata/${result.operationKey}.json`
    );
  if (result.kind === "advisory")
    return path.startsWith("data/snapshots/policy-review/");
  if (result.kind === "report-import")
    return [
      "data/security/tavernkeeper-report-summaries.json",
      "data/security/tavernkeeper-import-state.json",
    ].includes(path);
  if (["kit", "withdrawal"].includes(result.kind))
    return (
      path.startsWith("data/registry/kits/") ||
      path.startsWith("data/snapshots/github/kits/")
    );
  return (
    path.startsWith("data/registry/projects/") ||
    path === `data/registry/sources/${result.source.id}.json` ||
    ["github", "codeberg", "install"].some(
      (provider) =>
        path === `data/snapshots/${provider}/${result.source.id}.json`,
    )
  );
}
export function assertTrustedPreparationOrigin({
  kind,
  repository,
  run,
  publisherActorId,
}) {
  const producerPaths = (workflows[kind] ?? []).map(
    (name) => `.github/workflows/${name}.yml`,
  );
  if (
    !Number.isSafeInteger(publisherActorId) ||
    publisherActorId < 1 ||
    !producerPaths.includes(run?.path) ||
    !Number.isSafeInteger(run?.id) ||
    run.id < 1 ||
    !/^[a-f0-9]{40}$/u.test(run.head_sha ?? "") ||
    run.actor?.id !== publisherActorId ||
    run.actor?.type !== "Bot" ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== "main" ||
    run.head_repository?.full_name !== repository
  )
    fail("prepared-producer-untrusted");
}
export function assertTrustedPreparedProducer({
  kind,
  repository,
  run,
  publisherActorId,
  requireSuccess = true,
}) {
  assertTrustedPreparationOrigin({ kind, repository, run, publisherActorId });
  if (
    run.status !== "completed" ||
    (requireSuccess
      ? run.conclusion !== "success"
      : ![
          "success",
          "failure",
          "cancelled",
          "timed_out",
          "skipped",
          "neutral",
          "action_required",
          "stale",
        ].includes(run.conclusion))
  )
    fail("prepared-producer-untrusted");
}
export function validatePreparedResult(
  result,
  { operation, run, publisherActorId, currentState },
) {
  validateAutomationOperation(operation);
  if (!validate(result)) fail("prepared-schema-invalid");
  if (result.modelUsage) {
    if (
      ![
        "metadata",
        "advisory",
        "report-import",
        "project",
        "owner-request",
      ].includes(result.kind)
    )
      fail("prepared-schema-invalid");
    try {
      validateModelUsageEvidence(result.modelUsage);
    } catch {
      fail("prepared-schema-invalid");
    }
  }
  if (
    ["refresh", "metadata", "advisory"].includes(result.kind) &&
    operation.identity.subject !==
      (result.kind === "refresh"
        ? `source:${result.source.id}`
        : `source:${result.source.id}:${currentState?.projectId}`)
  )
    fail("prepared-operation-mismatch");
  if (result.baseSha !== result.producer.sourceSha)
    fail("prepared-base-invalid");
  assertTrustedPreparedProducer({
    kind: result.kind,
    repository: result.repository,
    run,
    publisherActorId,
  });
  if (
    run?.id !== result.producer.runId ||
    run.path !== result.producer.workflow ||
    run.head_sha !== result.producer.sourceSha
  )
    fail("prepared-producer-untrusted");
  if (
    result.operationKey !== operation.key ||
    result.kind !== operation.identity.kind ||
    result.inputDigest !== operation.identity.inputDigest ||
    result.policyVersion !== operation.identity.policyVersion
  )
    fail("prepared-operation-mismatch");
  if (
    !currentState ||
    currentState.repository !== result.repository ||
    !/^[a-f0-9]{40}$/u.test(currentState.mainSha ?? "")
  )
    fail("prepared-state-invalid");
  if (
    currentState.authorityValid !== true ||
    currentState.authorId !== result.authorId
  )
    fail("prepared-authority-lost");
  if (
    currentState.source?.id !== result.source.id ||
    currentState.source?.identity !== result.source.identity
  )
    fail("prepared-source-changed");
  if (
    currentState.inputDigest !== result.inputDigest ||
    currentState.policyVersion !== result.policyVersion
  )
    fail("prepared-input-stale");
  if (
    !Array.isArray(currentState.allowedPaths) ||
    typeof currentState.validateContent !== "function" ||
    !currentState.fileDigests
  )
    fail("prepared-state-invalid");
  const seen = new Set();
  let totalBytes = 0;
  for (const file of result.files) {
    if (
      seen.has(file.path) ||
      !allowedPath(result, file.path) ||
      !currentState.allowedPaths.includes(file.path)
    )
      fail("prepared-path-invalid");
    seen.add(file.path);
    totalBytes += file.bytes;
    if (
      Buffer.byteLength(file.content) !== file.bytes ||
      createHash("sha256").update(file.content).digest("hex") !== file.sha256 ||
      totalBytes > 33_554_432
    )
      fail("prepared-content-invalid");
    if ((currentState.fileDigests[file.path] ?? null) !== file.baseDigest)
      fail("prepared-base-stale");
    if (file.sha256 === file.baseDigest) fail("prepared-content-invalid");
    let value;
    try {
      value = JSON.parse(file.content);
    } catch {
      fail("prepared-content-invalid");
    }
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      currentState.validateContent(file.path, value) !== true
    )
      fail("prepared-content-invalid");
  }
  if (
    currentState.validateFiles &&
    currentState.validateFiles(result.files) !== true
  )
    fail("prepared-content-invalid");
  return result;
}
