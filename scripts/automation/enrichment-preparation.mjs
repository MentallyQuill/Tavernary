import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Ajv from "ajv";
import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import { metadataFieldsToGenerate } from "../catalog/metadata-policy.mjs";
import { tagVocabularyHash } from "../catalog/tag-vocabulary.mjs";
import { validateEnrichmentOutput } from "../catalog/enrichment-contract.mjs";
import {
  createEnrichmentReport,
  validateEnrichmentReport,
} from "../catalog/enrichment-report.mjs";
import {
  applyAttemptResults,
  selectNextRunBatch,
  assertFullRolloutAllowed,
  approveCanaryDeployment,
  recordCheckpointPublication,
} from "../catalog/enrichment-run-state.mjs";
import {
  runCli,
  applyEnrichmentOutput,
  selectEnrichmentRecords,
} from "../catalog/enrich-readmes.mjs";
import { modelProviderOptionsFromEnvironment } from "../catalog/model-provider-configuration.mjs";
import { observeProjectMetadataSource } from "./metadata-preparation.mjs";
import { operationKey, validateAutomationOperation } from "./operation.mjs";
import {
  recoverInventoryWorker,
  trustedOperationWorkerRuns,
} from "./inventory-worker.mjs";
import { canonicalFileDigests } from "./canonical-files.mjs";
import { readCanonicalFiles } from "./canonical-files.mjs";
import { classifyAutomationFailure } from "./failure.mjs";
import { isConfirmedDeployment } from "./deployment-operations.mjs";
import { formatJson } from "../catalog/json-format.mjs";

const reportPaths = {
  canary: "data/reports/enrichment-canary.json",
  full: "data/reports/enrichment-report.json",
};
const normalizeReport = (value) =>
  createEnrichmentReport(validateEnrichmentReport(structuredClone(value)));
const failure = (code) =>
  Object.assign(new Error("Enrichment checkpoint is unavailable."), { code });

export function hasConfirmedEnrichmentCanary(state, full) {
  try {
    const canary = normalizeReport(state.local.enrichmentCanary);
    assertFullRolloutAllowed(canary, full.expected_model, full.selection_mode);
    if (
      full.authorized_canary_run_id !== canary.run_id ||
      canary.publication?.checkpoint_commit_sha !== canary.deployment.commit_sha
    )
      return false;
    const revision = canary.deployment.commit_sha;
    if (
      !(state.local.deployments ?? []).some(
        (deployment) =>
          deployment.sourceSha === revision &&
          deployment.workflowRunId === canary.deployment.run_id &&
          isConfirmedDeployment(deployment, {
            sha: revision,
            catalogDigest: deployment.confirmation?.catalogDigest,
            targetDigest: deployment.confirmation?.targetDigest,
          }),
      )
    )
      return false;
    // Approval changes only private report state; bind the original awaiting-deployment bytes.
    const bytes = readCanonicalFiles({
      root: state.root,
      revision,
      paths: [reportPaths.canary],
    })[reportPaths.canary];
    if (!bytes) return false;
    const checkpoint = normalizeReport(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    const approved = createEnrichmentReport(
      approveCanaryDeployment(
        recordCheckpointPublication(checkpoint, {
          commitSha: revision,
          now: canary.publication.recorded_at,
        }),
        {
          commitSha: revision,
          deploymentRunId: canary.deployment.run_id,
          now: canary.deployment.verified_at,
        },
      ),
    );
    if (!isDeepStrictEqual(approved, canary)) return false;
    const checkpointDigest = createHash("sha256").update(bytes).digest("hex");
    return (state.local.publications ?? []).some(
      ({ record, revision: sourceSha }) =>
        sourceSha === revision &&
        record.operation.identity.kind === "enrichment" &&
        record.files.some(
          (file) =>
            file.path === reportPaths.canary &&
            file.sha256 === checkpointDigest &&
            state.local.publicationFileDigests?.[`${revision}:${file.path}`] ===
              file.sha256,
        ),
    );
  } catch {
    return false;
  }
}

function checkpointRecords(state) {
  let report;
  const canary = state.local.enrichmentCanary
    ? normalizeReport(state.local.enrichmentCanary)
    : null;
  const full = state.local.enrichmentFull
    ? normalizeReport(state.local.enrichmentFull)
    : null;
  if (canary?.status === "running") report = canary;
  else if (
    full?.status === "running" &&
    hasConfirmedEnrichmentCanary(state, full)
  )
    report = full;
  else return null;
  const batch = selectNextRunBatch(report, { checkpointLimit: 1 });
  const id = batch.projectIds[0];
  if (!id) return null;
  const project = state.local.projects.find((value) => value.id === id);
  const source = state.local.sources.find(
    (value) => value.id === project?.source_id,
  );
  const snapshot = state.local.snapshots.find(
    (value) => value.source_id === source?.id,
  );
  const eligible = Boolean(
    project &&
    source &&
    selectEnrichmentRecords(
      [project],
      { [source.id]: source },
      { force: report.selection_mode === "all-automatic" },
    ).length,
  );
  return {
    report,
    batch,
    id,
    project,
    source,
    snapshot,
    eligible,
    reportPath: reportPaths[report.mode],
  };
}

export function discoverEnrichmentOperations(state) {
  const selected = checkpointRecords(state);
  if (!selected) return [];
  const { report, batch, project, source, snapshot } = selected;
  const identity = {
    kind: "enrichment",
    subject: `maintenance:enrichment:${report.run_id}:${batch.phase}:${report.primary_cursor}:${report.retry_cursor}`,
    inputDigest: fingerprintProjectPublicationInput({
      report,
      project: project ?? null,
      source: source ?? null,
      snapshot: snapshot ?? null,
      vocabularyHash: state.local.vocabularyHash,
    }),
    policyVersion: CATALOG_POLICY_VERSION,
  };
  const operation = {
    key: operationKey(identity),
    identity,
    stage: "admitted",
    createdAt: report.updated_at,
    nextEligibleAt: null,
    expectedSha: snapshot?.repository?.head_sha ?? null,
    workerRunId: null,
    retry: null,
  };
  recoverInventoryWorker(
    operation,
    {
      receipts: state.receipts,
      runs: state.remote.runs,
      repository: state.repository,
      publisherActorId: state.publisherActorId,
      nowMs: state.nowMs,
    },
    trustedOperationWorkerRuns(
      { runs: state.remote.runs, publisherActorId: state.publisherActorId },
      operation,
    ),
  );
  return [validateAutomationOperation(operation)];
}

function currentCheckpoint({ state, operation }) {
  validateAutomationOperation(operation);
  if (
    operation.identity.kind !== "enrichment" ||
    !state.operations.some((value) => value.key === operation.key) ||
    !discoverEnrichmentOperations(state).some(
      (value) => value.key === operation.key,
    )
  )
    throw failure("input-superseded");
  return checkpointRecords(state);
}
async function observeCheckpoint({ state, selected, observe }) {
  if (!selected.eligible) return null;
  const { project, source, snapshot } = selected;
  if (
    !["github", "codeberg"].includes(source.type) ||
    source.status !== "active" ||
    source.refresh_policy !== "automatic" ||
    !Number.isSafeInteger(source.repository_id) ||
    source.repository_id < 1 ||
    snapshot?.repository?.id !== source.repository_id
  )
    throw failure("authorization-lost");
  if (snapshot.source_health !== "healthy" || snapshot.stale_since !== null)
    throw failure("provider-unavailable");
  return (observe ?? observeProjectMetadataSource)({
    state,
    project,
    source,
    snapshot,
  });
}

export async function enrichmentCheckpointNeedsModel(input) {
  const selected = currentCheckpoint(input);
  if (Object.hasOwn(input, "model")) {
    if (!input.model) throw failure("provider-configuration-invalid");
    if (input.model !== selected.report.expected_model)
      throw failure("provider-model-mismatch");
  }
  const observation = await observeCheckpoint({
    state: input.state,
    selected,
    observe: input.observe,
  });
  return observation?.source.status === "ready";
}

export async function acquirePreparedEnrichmentData({
  state,
  operation,
  options = {},
}) {
  const selected = currentCheckpoint({ state, operation });
  const observation = await observeCheckpoint({
    state,
    selected,
    observe: options.observe,
  });
  const configuration =
    options.providerConfiguration ??
    modelProviderOptionsFromEnvironment(options.env);
  if (!configuration.model) throw failure("provider-configuration-invalid");
  if (configuration.model !== selected.report.expected_model)
    throw failure("provider-model-mismatch");
  const budgetGuard =
    !options.provider && observation?.source.status === "ready"
      ? await options.budgetGuard?.()
      : undefined;
  const outputs = {};
  const report = await runCli({
    root: state.root,
    mode: selected.report.mode === "canary" ? "canary" : "resume",
    provider: options.provider,
    providerConfiguration: configuration,
    records: state.local.projects,
    sources: state.local.sources,
    snapshots: state.local.snapshots,
    previousReport: selected.report,
    projectIds:
      selected.report.mode === "canary"
        ? [...selected.report.manifest]
        : undefined,
    selectionMode: selected.report.selection_mode,
    checkpointLimit: 1,
    requireBudget: true,
    budgetGuard,
    reportPath: null,
    now: new Date(state.nowMs).toISOString(),
    loadSource: async () => observation.source,
    writeRecord: async (record, output, vocabulary) => {
      outputs[`data/registry/projects/${record.id}.json`] = await formatJson(
        applyEnrichmentOutput(record, output, vocabulary),
      );
    },
    writeReport: async () => {},
  });
  const entry = report.entries[selected.id];
  const unavailable = classifyAutomationFailure({
    diagnosticCode: entry?.reason_code,
  });
  if (["configuration", "transient"].includes(unavailable.kind))
    throw failure(unavailable.reasonCode);
  outputs[selected.reportPath] = await formatJson(report);
  return outputs;
}

const entryMappings = [
  ["sourceKind", "source_kind"],
  ["sourceIdentity", "source_identity"],
  ["repositoryId", "repository_id"],
  ["headSha", "head_sha"],
  ["readmePath", "readme_path"],
  ["readmeRef", "readme_ref"],
  ["redditPostId", "reddit_post_id"],
  ["sourceId", "source_id"],
  ["requestedFields", "requested_fields"],
  ["vocabularyHash", "vocabulary_hash"],
  ["finalTags", "final_tags"],
  ["tagEvidence", "tag_evidence"],
  ["summaryEvidence", "summary_evidence"],
  ["tagGenerationDiagnostic", "tag_generation_diagnostic"],
  ["reasonCode", "reason_code"],
  ["enrichmentNote", "enrichment_note"],
  ["diagnosticCode", "diagnostic_code"],
  ["repairHint", "repair_hint"],
];
function attemptFromEntry(entry, previous) {
  const outcomes = {
    enriched: "enriched",
    "retry-enriched": "enriched",
    fallback: "fallback",
    "retry-fallback": "fallback",
    "retry-pending": "failed",
    "final-failure": "failed",
    "source-not-ready": "source-not-ready",
    skipped: "skipped",
  };
  const result = {
    id: entry.id,
    phase: entry.phase,
    outcome: outcomes[entry.outcome],
  };
  for (const [key, field] of entryMappings)
    if (entry[field] !== undefined) result[key] = entry[field];
  if (entry.requested_model !== undefined)
    result.provider = {
      requestedModel: entry.requested_model,
      returnedModel: entry.returned_model,
      latencyMs: entry.latency_ms,
    };
  if (entry.copy_result !== undefined)
    result.output = {
      result: entry.copy_result,
      change_reasons: entry.copy_change_reasons,
      policy_signal: entry.copy_policy_signal,
    };
  for (const [key, field] of [
    ["providerCallCount", "provider_calls"],
    ["providerRepairCallCount", "provider_repair_calls"],
    ["providerRateLimitCount", "provider_rate_limit_events"],
    ["providerLatencyMsTotal", "provider_latency_ms_total"],
  ])
    if (entry[field] !== undefined) {
      result[key] = entry[field] - (previous?.[field] ?? 0);
      if (!Number.isSafeInteger(result[key]) || result[key] < 0)
        throw failure("validation-failed");
    }
  if (
    result.providerCallCount > 3 ||
    result.providerRepairCallCount > result.providerCallCount ||
    result.providerRateLimitCount > result.providerCallCount
  )
    throw failure("validation-failed");
  return result;
}

export async function createPreparedEnrichmentContext({
  state,
  operation,
  observe,
  validateProject,
}) {
  const selected = currentCheckpoint({ state, operation });
  const observation = await observeCheckpoint({ state, selected, observe });
  const vocabulary = JSON.parse(
    await readFile(resolve(state.root, "data/vocabularies/tags.json"), "utf8"),
  );
  if (!validateProject) {
    const ajv = new Ajv({ strict: false });
    ajv.addFormat("uri", (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    });
    ajv.addFormat("date-time", (value) => Number.isFinite(Date.parse(value)));
    validateProject = ajv.compile(
      JSON.parse(
        await readFile(
          resolve(state.root, "data/schemas/project.schema.json"),
          "utf8",
        ),
      ),
    );
  }
  const { report, reportPath, project, source, id } = selected;
  const projectPath = `data/registry/projects/${id}.json`;
  const paths = [reportPath, ...(selected.eligible ? [projectPath] : [])];
  const fields = selected.eligible ? metadataFieldsToGenerate(project) : [];
  const immutableProject = (value) =>
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => ![...fields, "metadata_status"].includes(key),
      ),
    );
  function validateReport(value) {
    try {
      const normalized = normalizeReport(value);
      if (
        !isDeepStrictEqual(value, normalized) ||
        !Number.isFinite(Date.parse(value.updated_at)) ||
        Date.parse(value.updated_at) < Date.parse(report.updated_at) ||
        Date.parse(value.updated_at) > state.nowMs + 300000
      )
        return false;
      const entry = value.entries[id];
      if (
        !entry ||
        ["configuration", "transient"].includes(
          classifyAutomationFailure({ diagnosticCode: entry.reason_code }).kind,
        )
      )
        return false;
      const attempt = attemptFromEntry(entry, report.entries[id]);
      const expected = createEnrichmentReport(
        applyAttemptResults(report, [attempt], value.updated_at, {
          checkpointLimit: 1,
        }),
      );
      return isDeepStrictEqual(value, expected);
    } catch {
      return false;
    }
  }
  function validateContent(path, value) {
    if (path === reportPath) return validateReport(value);
    if (path !== projectPath || !selected.eligible || !validateProject(value))
      return false;
    return (
      isDeepStrictEqual(immutableProject(project), immutableProject(value)) &&
      value.metadata_status === "curated" &&
      (!fields.includes("tags") ||
        value.tags.every((tag) =>
          vocabulary.tags.some((definition) => definition.id === tag),
        ))
    );
  }
  function validateFiles(files) {
    try {
      if (
        !Array.isArray(files) ||
        files.length < 1 ||
        files.length > 2 ||
        new Set(files.map((file) => file.path)).size !== files.length ||
        files.some((file) => !paths.includes(file.path))
      )
        return false;
      const reportFile = files.find((file) => file.path === reportPath);
      if (!reportFile) return false;
      const next = JSON.parse(reportFile.content);
      if (!validateReport(next)) return false;
      const entry = next.entries[id];
      const proposed = files.find((file) => file.path === projectPath);
      const success = [
        "enriched",
        "retry-enriched",
        "fallback",
        "retry-fallback",
      ].includes(entry.outcome);
      if (!success) return !proposed;
      if (!selected.eligible || !observation) return false;
      const updated = proposed ? JSON.parse(proposed.content) : project;
      if (!validateContent(projectPath, updated)) return false;
      const provenance = {
        source_kind: observation.source.sourceKind,
        source_identity: observation.source.sourceIdentity,
        repository_id: observation.source.repositoryId,
        head_sha: observation.source.headSha,
        readme_path: observation.source.readmePath,
        readme_ref: observation.source.readmeRef,
        source_id: project.source_id,
        requested_fields: fields,
        vocabulary_hash: tagVocabularyHash(vocabulary),
      };
      if (
        !Object.entries(provenance).every(([key, value]) =>
          isDeepStrictEqual(entry[key], value),
        )
      )
        return false;
      if (observation.source.status === "ready") {
        if (
          !["enriched", "retry-enriched"].includes(entry.outcome) ||
          entry.requested_model !== report.expected_model ||
          entry.returned_model !== report.expected_model ||
          !Number.isSafeInteger(entry.provider_calls) ||
          entry.provider_calls <= (report.entries[id]?.provider_calls ?? 0)
        )
          return false;
      } else if (
        !["fallback", "retry-fallback"].includes(entry.outcome) ||
        entry.requested_model !== undefined
      )
        return false;
      const output = {
        ...(fields.includes("summary")
          ? {
              summary: {
                value: updated.summary,
                evidence: entry.summary_evidence,
              },
              result: entry.copy_result,
              change_reasons: entry.copy_change_reasons,
              policy_signal: entry.copy_policy_signal,
            }
          : {}),
        ...(fields.includes("tags")
          ? {
              tags: entry.final_tags.map((tag) => ({
                id: tag,
                evidence: entry.tag_evidence[tag],
              })),
            }
          : {}),
      };
      if (
        fields.includes("tags") &&
        !isDeepStrictEqual(updated.tags, entry.final_tags)
      )
        return false;
      return validateEnrichmentOutput(output, {
        requestedFields: fields,
        tagVocabulary: vocabulary,
        kind: project.kind,
        copyContext: {
          mode: "synthesize",
          submittedSummary: "",
          protectedTerms: [project.name, ...source.repository.split("/")],
        },
      }).valid;
    } catch {
      return false;
    }
  }
  return {
    repository: state.repository,
    mainSha: state.local.revision,
    projectId: id,
    source: {
      id: source?.id ?? "enrichment-rollout",
      identity: source
        ? `${source.type}:${source.repository_id}`
        : `maintenance:${report.run_id}`,
    },
    authorId: 2625904,
    inputDigest: operation.identity.inputDigest,
    policyVersion: operation.identity.policyVersion,
    authorityValid: true,
    allowedPaths: paths,
    fileDigests: canonicalFileDigests({
      root: state.root,
      revision: state.local.revision,
      paths,
    }),
    validateContent,
    validateFiles,
  };
}
