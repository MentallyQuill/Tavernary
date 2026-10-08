import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalFileDigests } from "./canonical-files.mjs";
import Ajv from "ajv";
import { validateAutomationOperation } from "./operation.mjs";
import { metadataFieldsToGenerate } from "../catalog/metadata-policy.mjs";
import { effectiveListingState } from "../../src/features/catalog/listing-state.mjs";
import { createPolicyEvidenceFingerprint } from "../moderation/catalog-policy-review-contract.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import { createKitPreparedPublicationContext } from "./kit-publication-context.mjs";
import { createPreparedReportContext } from "./report-publication-context.mjs";

const schemaNames = {
  project: "project",
  snapshot: "repository-snapshot",
  install: "extension-install-evidence",
  advisory: "catalog-policy-review",
  kit: "kit",
  support: "kit-support-snapshot",
};
async function schemaValidators(root) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addFormat("uri", (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  });
  ajv.addFormat(
    "date-time",
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value),
  );
  const values = await Promise.all(
    Object.entries(schemaNames).map(async ([key, name]) => [
      key,
      ajv.compile(
        JSON.parse(
          await readFile(
            resolve(root, `data/schemas/${name}.schema.json`),
            "utf8",
          ),
        ),
      ),
    ]),
  );
  return Object.fromEntries(values);
}
export async function createPreparedPublicationContext({
  state,
  operation,
  preparation = false,
}) {
  validateAutomationOperation(operation);
  if (
    !state.operations.some((current) => current.key === operation.key) ||
    (!preparation && state.local.revision !== state.remote.mainHeadSha)
  )
    throw Object.assign(new Error("Canonical operation is superseded."), {
      code: "input-superseded",
    });
  if (["kit", "withdrawal"].includes(operation.identity.kind))
    return createKitPreparedPublicationContext({
      state,
      operation,
      validators: await schemaValidators(state.root),
    });
  if (operation.identity.kind === "report-import")
    return createPreparedReportContext({ state, operation });
  if (!["refresh", "metadata", "advisory"].includes(operation.identity.kind))
    throw new Error("Publication domain is not implemented.");
  const parts = operation.identity.subject.split(":");
  const source = state.local.sources.find((source) => source.id === parts[1]);
  if (
    !source ||
    source.status !== "active" ||
    source.refresh_policy !== "automatic" ||
    !["github", "codeberg"].includes(source.type) ||
    !Number.isSafeInteger(source.repository_id) ||
    source.repository_id < 1
  )
    throw Object.assign(new Error("Source authority changed."), {
      code: "authorization-lost",
    });
  const snapshot = state.local.snapshots.find(
    (snapshot) => snapshot.source_id === source.id,
  );
  const project =
    operation.identity.kind === "refresh"
      ? null
      : state.local.projects.find(
          (project) =>
            project.id === parts[2] && project.source_id === source.id,
        );
  if (
    operation.identity.kind !== "refresh" &&
    (!project ||
      !effectiveListingState({ project, source, snapshot }).public ||
      snapshot?.repository?.id !== source.repository_id)
  )
    throw Object.assign(new Error("Source evidence changed."), {
      code: "input-superseded",
    });
  const validators = await schemaValidators(state.root);
  const tagVocabulary = JSON.parse(
    await readFile(resolve(state.root, "data/vocabularies/tags.json"), "utf8"),
  );
  const tagIds = new Set(tagVocabulary.tags.map((tag) => tag.id));
  const paths =
    operation.identity.kind === "refresh"
      ? [
          `data/snapshots/${source.type}/${source.id}.json`,
          `data/snapshots/install/${source.id}.json`,
        ]
      : operation.identity.kind === "metadata"
        ? [`data/registry/projects/${project.id}.json`]
        : [`data/snapshots/policy-review/${project.id}.json`];
  const fileDigests = canonicalFileDigests({
    root: state.root,
    revision: state.local.revision,
    paths,
  });
  const automaticFields = project
    ? new Set(metadataFieldsToGenerate(project))
    : new Set();
  const previousAdvisory = project
    ? state.local.advisoryState.find(
        (value) =>
          value.project_id === project.id && value.source_id === source.id,
      )
    : null;
  const validateContent = (path, value) => {
    if (
      !paths.includes(path) ||
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      return false;
    if (operation.identity.kind === "refresh") {
      if (path.startsWith("data/snapshots/install/"))
        return validators.install(value) && value.source_id === source.id;
      return (
        validators.snapshot(value) &&
        value.source_id === source.id &&
        value.provider === source.type &&
        value.repository.id === source.repository_id
      );
    }
    if (operation.identity.kind === "metadata") {
      if (
        !validators.project(value) ||
        value.id !== project.id ||
        value.source_id !== source.id ||
        value.tags.some((tag) => !tagIds.has(tag))
      )
        return false;
      const mutable = new Set([...automaticFields, "metadata_status"]);
      const unchanged = (record) =>
        Object.fromEntries(
          Object.entries(record).filter(([key]) => !mutable.has(key)),
        );
      return (
        fingerprintProjectPublicationInput(unchanged(project)) ===
        fingerprintProjectPublicationInput(unchanged(value))
      );
    }
    return (
      validators.advisory(value) &&
      value.maintenance_issue_number ===
        (previousAdvisory?.maintenance_issue_number ?? null) &&
      value.project_id === project.id &&
      value.source_id === source.id &&
      value.source_identity ===
        `${source.type}:${source.repository.toLowerCase()}` &&
      value.policy_version === operation.identity.policyVersion &&
      value.evidence_fingerprint ===
        createPolicyEvidenceFingerprint({
          projectId: project.id,
          sourceId: source.id,
          headSha: snapshot.repository.head_sha ?? "unavailable",
          policyVersion: operation.identity.policyVersion,
        })
    );
  };
  return {
    repository: state.repository,
    mainSha: state.local.revision,
    projectId: project?.id,
    source: {
      id: source.id,
      identity: `${source.type}:${source.repository_id}`,
    },
    authorId: state.publisherActorId,
    inputDigest: operation.identity.inputDigest,
    policyVersion: operation.identity.policyVersion,
    authorityValid: true,
    allowedPaths: paths,
    fileDigests,
    validateContent,
  };
}
