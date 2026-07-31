import {
  mkdir as defaultMkdir,
  readFile as defaultReadFile,
  readdir as defaultReaddir,
  rm as defaultRm,
  writeFile as defaultWriteFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { fingerprintSourceRecord } from "../../src/features/help/project-owner-record.mjs";
import { preserveCatalogSummary } from "../catalog/catalog-copy-preservation.mjs";
import { validateEnrichmentOutput } from "../catalog/enrichment-contract.mjs";
import { enrichRecord } from "../catalog/enrich-readmes.mjs";
import { loadEnrichmentSource } from "../catalog/enrichment-source.mjs";
import { createEnrichmentProvider } from "../catalog/enrichment-provider.mjs";
import { formatJson } from "../catalog/json-format.mjs";
import {
  automaticMetadataPolicy,
  manualMetadataPolicy,
  metadataFieldsToGenerate,
} from "../catalog/metadata-policy.mjs";
import { tagVocabularyHash } from "../catalog/tag-vocabulary.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import { applyProjectOwnerRequest } from "./apply-project-owner-request.mjs";
import { processProjectOwnerTriage } from "./triage-project-owner-request.mjs";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CARD_OPERATIONS = new Set(["edit-card", "retire-card", "restore-card"]);
const VOCABULARY_FILES = [
  ["frontends", "frontends.json", "frontends"],
  ["primaryFunctions", "primary-functions.json", "primary_functions"],
  ["tags", "tags.json", "tags"],
  ["modelFamilies", "model-families.json", "model_families"],
  ["completionFormats", "completion-formats.json", "completion_formats"],
];

function parseJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/u, ""));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function fingerprintProjectOwnerManifest(manifest) {
  return fingerprintProjectPublicationInput(manifest);
}

function sortedRecordArray(value) {
  if (!Array.isArray(value)) return value;
  if (
    value.every(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof entry.id === "string",
    )
  ) {
    return [...value].sort((left, right) => left.id.localeCompare(right.id));
  }
  return value;
}

function comparableReport(report) {
  const clone = structuredClone(report);
  delete clone.generated_at;
  if (Array.isArray(clone.project_ids)) {
    clone.project_ids.sort((left, right) => left.localeCompare(right));
  }
  clone.before = sortedRecordArray(clone.before);
  clone.after = sortedRecordArray(clone.after);
  return clone;
}

export function sameProjectOwnerGenerationReport(left, right) {
  return (
    Boolean(left) &&
    Boolean(right) &&
    JSON.stringify(comparableReport(left)) ===
      JSON.stringify(comparableReport(right))
  );
}

function inside(root, path) {
  const local = relative(root, path);
  return local === "" || (!local.startsWith("..") && !isAbsolute(local));
}

function repositoryName(hostRepository) {
  const value =
    typeof hostRepository === "string"
      ? hostRepository
      : typeof hostRepository?.owner === "string" &&
          typeof hostRepository?.name === "string"
        ? `${hostRepository.owner}/${hostRepository.name}`
        : "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value)) {
    throw new Error(
      "Owner generation requires trusted host repository context and an issue number.",
    );
  }
  return value;
}

function issuePath(hostRepository, issueNumber) {
  const repository = repositoryName(hostRepository);
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new Error(
      "Owner generation requires trusted host repository context and an issue number.",
    );
  }
  return `/repos/${repository}/issues/${issueNumber}`;
}

async function loadVocabularies(root, readFile) {
  const raw = Object.fromEntries(
    await Promise.all(
      VOCABULARY_FILES.map(async ([name, file, key]) => [
        name,
        parseJson(
          await readFile(resolve(root, "data", "vocabularies", file), "utf8"),
        ),
      ]),
    ),
  );
  return {
    ...Object.fromEntries(
      VOCABULARY_FILES.map(([name, _file, key]) => [
        name,
        raw[name]?.[key] ?? [],
      ]),
    ),
    tagVocabularyHash: tagVocabularyHash(raw.tags),
  };
}

function sectionValue(body, heading) {
  const matches = String(body ?? "")
    .split(/^### /mu)
    .slice(1)
    .filter((section) => section.split(/\r?\n/u)[0]?.trim() === heading);
  if (matches.length !== 1) return null;
  const value = matches[0].split(/\r?\n/u).slice(1).join("\n").trim();
  return /^_No response_$/iu.test(value) ? "" : value;
}

function generatedManifest(body) {
  const rendered = sectionValue(body, "Owner request manifest");
  if (!rendered) return null;
  const json =
    rendered.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/iu)?.[1] ??
    rendered;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function contextIdentifiers(issue) {
  const manifest = generatedManifest(issue?.body);
  const projectId = manifest?.project_id;
  const sourceId = manifest?.source_id;
  return {
    projectId:
      typeof projectId === "string" && ID_PATTERN.test(projectId)
        ? projectId
        : null,
    sourceId:
      typeof sourceId === "string" && ID_PATTERN.test(sourceId)
        ? sourceId
        : null,
  };
}

async function loadAllProjects(root, readFile, readdir) {
  const directory = resolve(root, "data", "registry", "projects");
  const names = (await readdir(directory))
    .filter(
      (name) =>
        typeof name === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(name),
    )
    .sort((left, right) => left.localeCompare(right));
  const entries = await Promise.all(
    names.map(async (name) => {
      const path = resolve(directory, name);
      const contents = await readFile(path, "utf8");
      return {
        value: parseJson(contents),
        contents,
        path: `data/registry/projects/${name}`,
      };
    }),
  );
  return {
    projects: entries.map((entry) => entry.value),
    priorContents: new Map(
      entries.map((entry) => [entry.path, entry.contents]),
    ),
  };
}

async function loadSource(root, sourceId, readFile) {
  const localPath = `data/registry/sources/${sourceId}.json`;
  const contents = await readFile(resolve(root, localPath), "utf8");
  return { value: parseJson(contents), contents, path: localPath };
}

async function loadSnapshot(root, sourceId, readFile) {
  const localPath = `data/snapshots/github/${sourceId}.json`;
  const contents = await readFile(resolve(root, localPath), "utf8");
  return { value: parseJson(contents), contents, path: localPath };
}

async function loadOpenRequests(hostRepository, request) {
  const repository = repositoryName(hostRepository);
  async function loadPages(path) {
    const values = [];
    for (let page = 1; ; page += 1) {
      const result = await request(page === 1 ? path : `${path}&page=${page}`);
      const entries = Array.isArray(result) ? result : [];
      values.push(...entries);
      if (entries.length < 100) return values;
    }
  }
  const [issues, pulls] = await Promise.all([
    loadPages(
      `/repos/${repository}/issues?state=open&labels=project-owner-request&per_page=100`,
    ),
    loadPages(`/repos/${repository}/pulls?state=open&per_page=100`),
  ]);
  return { issues, pulls };
}

function admitted(decision) {
  if (decision.status === "admitted") return decision;
  const error = new Error(
    `${decision.reasonCode}: ${decision.message ?? "owner request rejected"}`,
  );
  error.code = decision.reasonCode;
  throw error;
}

async function triagePhase(input, issueApiPath, root, readFile, readdir) {
  const issue = await input.request(issueApiPath);
  const identifiers = contextIdentifiers(issue);
  if (!identifiers.sourceId) {
    throw Object.assign(
      new Error("owner-request-invalid: Source ID is missing."),
      { code: "owner-request-invalid" },
    );
  }
  const [vocabularies, projectRegistry, sourceRecord, open] = await Promise.all(
    [
      loadVocabularies(root, readFile),
      loadAllProjects(root, readFile, readdir),
      loadSource(root, identifiers.sourceId, readFile),
      loadOpenRequests(input.hostRepository, input.request),
    ],
  );
  const project = identifiers.projectId
    ? projectRegistry.projects.find(
        (candidate) => candidate.id === identifiers.projectId,
      )
    : null;
  const decision = admitted(
    await processProjectOwnerTriage({
      issue,
      project: project ?? undefined,
      projects: projectRegistry.projects,
      source: sourceRecord.value,
      hostRepository: input.hostRepository,
      request: input.request,
      vocabularies,
      issues: open.issues,
      pulls: open.pulls,
    }),
  );
  return {
    decision,
    issue,
    vocabularies,
    projects: projectRegistry.projects,
    source: sourceRecord.value,
    priorContents: new Map([
      ...projectRegistry.priorContents,
      [sourceRecord.path, sourceRecord.contents],
    ]),
  };
}

function expectedPaths(operation, projectIds, sourceId) {
  if (CARD_OPERATIONS.has(operation) || operation === "add-cards") {
    return projectIds.map((id) => `data/registry/projects/${id}.json`);
  }
  if (operation === "move-source") {
    return [
      `data/registry/sources/${sourceId}.json`,
      `data/snapshots/github/${sourceId}.json`,
    ];
  }
  return [`data/registry/sources/${sourceId}.json`];
}

function exactPaths(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every((path, index) => path === expected[index])
  );
}

function generatedAt(now) {
  const value = typeof now === "function" ? now() : now;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Owner generation time must be a valid timestamp.");
  }
  return date.toISOString();
}

function trustedMetadataPolicy(metadata, authorityType) {
  return {
    summary:
      metadata.summary.mode === "manual"
        ? manualMetadataPolicy(authorityType)
        : automaticMetadataPolicy(),
    tags:
      metadata.tags.mode === "manual"
        ? manualMetadataPolicy(authorityType)
        : automaticMetadataPolicy(),
  };
}

function ownerMetadataCandidates(final, catalogedAt) {
  const { decision, source } = final;
  if (decision.operation === "edit-card") {
    const current = decision.project;
    const proposed = decision.manifest.proposed;
    return [
      {
        ...structuredClone(current),
        name: proposed.name,
        summary: proposed.summary,
        frontends: structuredClone(proposed.frontends),
        primary_function: proposed.primary_function,
        tags: structuredClone(proposed.tags),
        ...(current.kind === "preset"
          ? {
              model_families: structuredClone(proposed.model_families),
              completion_formats: structuredClone(proposed.completion_formats),
            }
          : {}),
        metadata_status: "provisional",
        metadata_policy: trustedMetadataPolicy(
          proposed.metadata,
          decision.authorityType,
        ),
      },
    ];
  }
  if (decision.operation !== "add-cards") return [];
  return decision.manifest.proposed_cards
    .map((draft) => ({
      schema_version: 6,
      id: draft.project_id,
      name: draft.name,
      kind: draft.kind,
      summary: draft.summary,
      metadata_status: "provisional",
      source_id: source.id,
      frontends: structuredClone(draft.frontends),
      primary_function: draft.primary_function,
      tags: structuredClone(draft.tags),
      metadata_policy: trustedMetadataPolicy(
        draft.metadata,
        decision.authorityType,
      ),
      ...(draft.kind === "preset"
        ? {
            model_families: structuredClone(draft.model_families),
            completion_formats: structuredClone(draft.completion_formats),
          }
        : {}),
      cataloged_at: catalogedAt,
      catalog_cohort: "standard",
      listing_status: "active",
      listing_status_reason: null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function proposedMetadataByProjectId(decision) {
  if (decision.operation === "edit-card") {
    return new Map([
      [
        decision.projectId,
        {
          original: decision.manifest.original,
          proposed: decision.manifest.proposed,
          isNew: false,
        },
      ],
    ]);
  }
  return new Map(
    (decision.manifest.proposed_cards ?? []).map((card) => [
      card.project_id,
      { original: null, proposed: card, isNew: true },
    ]),
  );
}

function ownerProtectedTerms(final, record, submittedSummary = "") {
  const repositoryParts =
    typeof final.source.repository === "string"
      ? final.source.repository.split("/").filter(Boolean)
      : [];
  const frontendIds = new Set(record.frontends ?? []);
  const frontendLabels = final.vocabularies.frontends
    .filter(({ id }) => frontendIds.has(id))
    .map(({ label }) => label)
    .filter(Boolean);
  const stableIdentifiers =
    submittedSummary.match(
      /\b[\p{Letter}\p{Number}]+(?:[-_.:/][\p{Letter}\p{Number}]+)+\b/gu,
    ) ?? [];
  return [
    ...new Set(
      [
        record.name,
        ...repositoryParts,
        ...frontendLabels,
        ...stableIdentifiers,
      ].filter(
        (term) =>
          typeof term === "string" && term.length > 0 && term.length <= 100,
      ),
    ),
  ].slice(0, 64);
}

function validateInjectedEnrichment(output, context) {
  return validateEnrichmentOutput(output, {
    requestedFields: context.requestedFields,
    kind: context.record.kind,
    tagVocabulary: { tags: context.vocabularies.tags },
    copyContext: {
      mode: "synthesize",
      submittedSummary: "",
      protectedTerms: context.protectedTerms,
    },
  });
}

async function injectedEnrichment(input, context) {
  let output = await input.enrichMetadata(context);
  let validation = validateInjectedEnrichment(output, context);
  if (!validation.valid) {
    const repairMessage = [...new Set(validation.errors)].join("; ");
    output = await input.enrichMetadata({
      ...context,
      repair: {
        reasonCode: "output-invalid",
        message: repairMessage,
        ...(typeof output?.summary?.value === "string"
          ? { rejectedSummary: output.summary.value.slice(0, 1_000) }
          : {}),
      },
    });
    validation = validateInjectedEnrichment(output, context);
  }
  if (!validation.valid) {
    const tagFallback =
      context.requestedFields.includes("tags") &&
      output &&
      typeof output === "object" &&
      !Array.isArray(output)
        ? { ...output, tags: [] }
        : null;
    if (tagFallback && validateInjectedEnrichment(tagFallback, context).valid) {
      return {
        ...tagFallback,
        tag_generation_diagnostic: "invalid-output-fell-back-empty",
      };
    }
    const error = new Error([...new Set(validation.errors)].join("; "));
    error.code = "output-invalid";
    throw error;
  }
  return output;
}

async function generatedMetadataOutput(
  input,
  final,
  snapshot,
  context,
  loadSource,
) {
  if (input.enrichMetadata) return injectedEnrichment(input, context);
  const provider =
    input.enrichmentProvider ??
    createEnrichmentProvider({
      apiUrl: process.env.TAVERNARY_ENRICHMENT_API_URL,
      apiKey: process.env.TAVERNARY_ENRICHMENT_API_KEY,
      model: process.env.TAVERNARY_ENRICHMENT_MODEL,
    });
  return enrichRecord(context.record, final.source, snapshot, provider, {
    force: true,
    vocabularies: { tags: final.vocabularies.tags },
    protectedTerms: context.protectedTerms,
    loadSource,
  });
}

function automaticMetadataResult(record, requestedFields, output) {
  return {
    project_id: record.id,
    requested_fields: [...requestedFields],
    ...(output?.summary
      ? { summary_evidence: [...output.summary.evidence] }
      : {}),
    ...(Array.isArray(output?.tags)
      ? {
          tag_evidence: output.tags.map((tag) => ({
            id: tag.id,
            evidence: [...tag.evidence],
          })),
        }
      : {}),
    ...(output?.tag_generation_diagnostic
      ? { tag_generation_diagnostic: output.tag_generation_diagnostic }
      : {}),
  };
}

async function resolveOwnerMetadata(input, final, snapshot, catalogedAt) {
  const candidates = ownerMetadataCandidates(final, catalogedAt);
  const proposed = proposedMetadataByProjectId(final.decision);
  const resolvedMetadataByProjectId = {};
  const copyResults = [];
  const metadataResults = [];
  const sourceLoader = input.loadEnrichmentSource ?? loadEnrichmentSource;
  let sourceEvidencePromise;
  const loadSourceOnce = (...arguments_) => {
    sourceEvidencePromise ??= sourceLoader(...arguments_);
    return sourceEvidencePromise;
  };

  for (const record of candidates) {
    const request = proposed.get(record.id);
    if (!request) {
      throw new Error(`Owner metadata request is missing for ${record.id}.`);
    }
    const requestedFields = metadataFieldsToGenerate(record);
    let summary = request.proposed.summary;
    let tags = structuredClone(request.proposed.tags);

    if (record.metadata_policy.summary.mode === "manual") {
      const summaryChanged =
        request.isNew || request.original?.summary !== request.proposed.summary;
      if (summaryChanged) {
        const copied = await preserveCatalogSummary({
          authorityType: final.decision.authorityType,
          submittedSummary: request.proposed.summary,
          protectedTerms: ownerProtectedTerms(
            final,
            record,
            request.proposed.summary,
          ),
          copySummary: input.copySummary,
        });
        summary = copied.publishedSummary;
        copyResults.push({
          project_id: record.id,
          mode: copied.mode,
          review_status: copied.reviewStatus,
          ...(copied.reviewStatus === "unavailable"
            ? { reason_code: copied.reasonCode }
            : {}),
          submitted_summary: copied.submittedSummary,
          published_summary: copied.publishedSummary,
          copy_result: copied.copyResult,
        });
      }
    }

    if (requestedFields.length > 0) {
      const context = {
        record,
        source: final.source,
        snapshot,
        requestedFields,
        vocabularies: { tags: final.vocabularies.tags },
        protectedTerms: ownerProtectedTerms(final, record),
      };
      const output = await generatedMetadataOutput(
        input,
        final,
        snapshot,
        context,
        loadSourceOnce,
      );
      if (!output) {
        const error = new Error(
          `Automatic metadata generation returned no output for ${record.id}.`,
        );
        error.code = "enrichment-output-missing";
        throw error;
      }
      if (
        requestedFields.includes("summary") &&
        output.summary?.value === "No README file found."
      ) {
        const error = new Error(
          `Automatic summary generation has no usable source copy for ${record.id}.`,
        );
        error.code = "enrichment-source-missing";
        throw error;
      }
      const validation = validateInjectedEnrichment(output, context);
      if (!validation.valid) {
        const error = new Error([...new Set(validation.errors)].join("; "));
        error.code = "output-invalid";
        throw error;
      }
      if (requestedFields.includes("summary")) {
        summary = output.summary.value;
        copyResults.push({
          project_id: record.id,
          mode: "synthesize",
          submitted_summary: null,
          published_summary: summary,
          copy_result: {
            result: output.result,
            change_reasons: [...output.change_reasons],
            policy_signal: output.policy_signal,
          },
        });
      }
      if (requestedFields.includes("tags")) {
        tags = output.tags.map(({ id }) => id);
      }
      metadataResults.push(
        automaticMetadataResult(record, requestedFields, output),
      );
    }

    resolvedMetadataByProjectId[record.id] = { summary, tags };
  }

  return {
    resolvedMetadataByProjectId,
    copyResults,
    metadataResults,
  };
}

function ownerGenerationProjectIds(final) {
  if (CARD_OPERATIONS.has(final.decision.operation)) {
    return [final.decision.projectId];
  }
  if (final.decision.operation === "add-cards") {
    return final.decision.manifest.proposed_cards
      .map((card) => card.project_id)
      .sort((left, right) => left.localeCompare(right));
  }
  return final.projects
    .filter((project) => project.source_id === final.source.id)
    .map((project) => project.id)
    .sort((left, right) => left.localeCompare(right));
}

function validatedReportError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function replayOwnerMetadata(validatedReport, final, candidates) {
  if (!isRecord(validatedReport)) {
    throw validatedReportError(
      "validated-owner-report-invalid",
      "Validated owner generation report is missing or malformed.",
    );
  }
  const expectedProjectIds = ownerGenerationProjectIds(final);
  const expectedIdentity = {
    schema_version: 2,
    issue_number: final.decision.issueNumber,
    project_id:
      expectedProjectIds.length === 1 &&
      CARD_OPERATIONS.has(final.decision.operation)
        ? expectedProjectIds[0]
        : null,
    project_ids: expectedProjectIds,
    source_id: final.source.id,
    operation: final.decision.operation,
    repository_id: final.decision.manifest.repository_id,
    authority_type: final.decision.authorityType,
    actor_id: final.issue.user?.id,
    actor_login: final.decision.actorLogin,
    actor_type: "User",
    request_fingerprint: fingerprintProjectOwnerManifest(
      final.decision.manifest,
    ),
    input_fingerprints: inputFingerprints(final.decision),
    source_identity: sourceIdentity(final.source),
    source_fingerprint: fingerprintSourceRecord(final.source),
    policy_version: CATALOG_POLICY_VERSION,
  };
  const actualIdentity = Object.fromEntries(
    Object.keys(expectedIdentity).map((key) => [key, validatedReport[key]]),
  );
  if (JSON.stringify(actualIdentity) !== JSON.stringify(expectedIdentity)) {
    throw validatedReportError(
      "validated-owner-report-stale",
      "Validated owner generation report does not match current trusted inputs.",
    );
  }

  const candidateIds = candidates
    .map((record) => record.id)
    .sort((left, right) => left.localeCompare(right));
  const resolution = validatedReport.resolved_metadata;
  if (
    !isRecord(resolution) ||
    JSON.stringify(Object.keys(resolution).sort()) !==
      JSON.stringify(candidateIds)
  ) {
    throw validatedReportError(
      "validated-owner-report-invalid",
      "Validated owner metadata resolution does not match current candidates.",
    );
  }
  const resolvedMetadataByProjectId = {};
  for (const projectId of candidateIds) {
    const value = resolution[projectId];
    if (
      !isRecord(value) ||
      typeof value.summary !== "string" ||
      !Array.isArray(value.tags)
    ) {
      throw validatedReportError(
        "validated-owner-report-invalid",
        `Validated owner metadata resolution is invalid for ${projectId}.`,
      );
    }
    resolvedMetadataByProjectId[projectId] = {
      summary: value.summary,
      tags: structuredClone(value.tags),
    };
  }

  const candidateIdSet = new Set(candidateIds);
  const validAuditEntries = (value) =>
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.project_id === "string" &&
        candidateIdSet.has(entry.project_id),
    );
  if (
    !validAuditEntries(validatedReport.copy_results) ||
    !validAuditEntries(validatedReport.metadata_results)
  ) {
    throw validatedReportError(
      "validated-owner-report-invalid",
      "Validated owner metadata audit entries are malformed.",
    );
  }
  return {
    resolvedMetadataByProjectId,
    copyResults: structuredClone(validatedReport.copy_results),
    metadataResults: structuredClone(validatedReport.metadata_results),
  };
}

async function writeOwnerGenerationTransaction({
  root,
  reportPath,
  files,
  reportContents,
  priorContents,
  makeDirectory,
  writeFile,
  remove,
}) {
  const attempted = [];
  try {
    for (const file of files) {
      const destination = resolve(root, file.path);
      if (!inside(root, destination)) {
        throw new Error(
          `Owner generated path escapes repository: ${file.path}`,
        );
      }
      attempted.push({
        destination,
        contents: priorContents.get(file.path) ?? null,
      });
      await makeDirectory(dirname(destination), { recursive: true });
      await writeFile(destination, file.contents, "utf8");
    }
    await makeDirectory(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, reportContents, "utf8");
  } catch (writeError) {
    const rollbackErrors = [];
    for (const file of [...attempted].reverse()) {
      try {
        if (file.contents === null) {
          await remove(file.destination, { force: true });
        } else {
          await writeFile(file.destination, file.contents, "utf8");
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      const error = new AggregateError(
        [writeError, ...rollbackErrors],
        `Owner generation rollback failed: ${rollbackErrors
          .map((failure) => failure.message)
          .join("; ")}`,
      );
      error.code = "owner-generation-rollback-failed";
      throw error;
    }
    throw writeError;
  }
}

function reportProjectIds(final, mutation) {
  if (CARD_OPERATIONS.has(final.decision.operation)) {
    return [final.decision.projectId];
  }
  if (final.decision.operation === "add-cards") {
    return mutation.projects.map((project) => project.id);
  }
  return final.projects
    .filter((project) => project.source_id === final.source.id)
    .map((project) => project.id)
    .sort((left, right) => left.localeCompare(right));
}

function sourceIdentity(source) {
  return source?.type === "github" &&
    Number.isSafeInteger(source.repository_id) &&
    source.repository_id > 0
    ? {
        type: "github",
        canonical: `github:${source.repository_id}`,
        repository_id: source.repository_id,
      }
    : null;
}

function inputFingerprints(decision) {
  if (CARD_OPERATIONS.has(decision.operation)) {
    return {
      projects: {
        [decision.projectId]: decision.manifest.project_fingerprint,
      },
      source: null,
    };
  }
  return {
    projects: {},
    source: decision.manifest.source_fingerprint,
  };
}

function changedValues(mutation) {
  return new Map([
    ...mutation.projects.map((project) => [
      `data/registry/projects/${project.id}.json`,
      project,
    ]),
    [`data/registry/sources/${mutation.source.id}.json`, mutation.source],
    ...(mutation.snapshot
      ? [
          [
            `data/snapshots/github/${mutation.source.id}.json`,
            mutation.snapshot,
          ],
        ]
      : []),
  ]);
}

export async function generateProjectOwnerRequest(input) {
  const root = resolve(input?.root ?? ".");
  const issueApiPath = issuePath(input?.hostRepository, input?.issue?.number);
  const reportPath = resolve(
    input?.reportPath ??
      resolve(root, "..", `owner-request-${input?.issue?.number}-report.json`),
  );
  if (inside(root, reportPath)) {
    throw new Error(
      "Owner generation report must be outside the repository output.",
    );
  }
  if (typeof input?.request !== "function") {
    throw new Error("Owner generation requires an injected GitHub request.");
  }
  const readFile = input.readFile ?? defaultReadFile;
  const readdir = input.readdir ?? defaultReaddir;
  const writeFile = input.writeFile ?? defaultWriteFile;
  const remove = input.rm ?? defaultRm;
  const makeDirectory =
    input.mkdir ?? (input.writeFile ? async () => {} : defaultMkdir);

  const initial = await triagePhase(
    input,
    issueApiPath,
    root,
    readFile,
    readdir,
  );
  const final = await triagePhase(input, issueApiPath, root, readFile, readdir);
  const catalogedAt = generatedAt(
    input.validatedReport?.generated_at ?? input.now,
  );

  let snapshotRecord = null;
  if (final.decision.operation === "move-source") {
    snapshotRecord = await loadSnapshot(root, final.source.id, readFile);
    final.priorContents.set(snapshotRecord.path, snapshotRecord.contents);
  }
  const metadataCandidates = ownerMetadataCandidates(final, catalogedAt);
  const needsAutomaticMetadata = metadataCandidates.some(
    (record) => metadataFieldsToGenerate(record).length > 0,
  );
  const metadataSnapshotRecord =
    !input.validatedReport &&
    needsAutomaticMetadata &&
    (final.source.type === "github" || final.source.type === "codeberg")
      ? await loadSnapshot(root, final.source.id, readFile)
      : null;
  const metadata = input.validatedReport
    ? replayOwnerMetadata(input.validatedReport, final, metadataCandidates)
    : await resolveOwnerMetadata(
        input,
        final,
        metadataSnapshotRecord?.value ?? null,
        catalogedAt,
      );
  const mutation = applyProjectOwnerRequest({
    issueNumber: final.decision.issueNumber,
    authorityType: final.decision.authorityType,
    manifest: final.decision.manifest,
    projects: final.projects,
    source: final.source,
    snapshot: snapshotRecord?.value ?? null,
    repository: final.decision.repository ?? undefined,
    vocabularies: final.vocabularies,
    catalogedAt,
    resolvedMetadataByProjectId: metadata.resolvedMetadataByProjectId,
  });
  const projectIds = reportProjectIds(final, mutation);
  const allowedPaths = expectedPaths(
    final.decision.operation,
    projectIds,
    final.source.id,
  );
  if (!exactPaths(mutation.changedPaths, allowedPaths)) {
    throw new Error(
      "Owner mutation returned paths outside its approved operation.",
    );
  }

  const primaryCopy =
    final.decision.operation === "edit-card"
      ? (metadata.copyResults.find(
          (entry) => entry.project_id === final.decision.projectId,
        ) ?? null)
      : null;
  const report = {
    schema_version: 2,
    issue_number: final.decision.issueNumber,
    project_id:
      projectIds.length === 1 && CARD_OPERATIONS.has(final.decision.operation)
        ? projectIds[0]
        : null,
    project_ids: projectIds,
    source_id: final.source.id,
    operation: final.decision.operation,
    publication_mode:
      final.decision.operation === "add-cards" ||
      metadata.copyResults.some(
        (entry) => entry.review_status === "unavailable",
      )
        ? "manual"
        : "automatic",
    repository_id: final.decision.manifest.repository_id,
    authority_type: final.decision.authorityType,
    actor_id: final.issue.user?.id,
    actor_login: final.decision.actorLogin,
    actor_type: "User",
    request_fingerprint: fingerprintProjectOwnerManifest(
      final.decision.manifest,
    ),
    input_fingerprints: inputFingerprints(final.decision),
    source_identity: sourceIdentity(final.source),
    source_fingerprint: fingerprintSourceRecord(final.source),
    policy_version: CATALOG_POLICY_VERSION,
    generated_at: catalogedAt,
    resolved_metadata: structuredClone(metadata.resolvedMetadataByProjectId),
    copy_results: metadata.copyResults,
    metadata_results: metadata.metadataResults,
    ...(primaryCopy
      ? {
          submitted_summary: primaryCopy.submitted_summary,
          published_summary: primaryCopy.published_summary,
          copy_mode: primaryCopy.mode,
          copy_result: primaryCopy.copy_result,
        }
      : {}),
    before: mutation.before,
    after: mutation.after,
    warnings: [
      ...new Set([...initial.decision.warnings, ...final.decision.warnings]),
    ],
    generated_paths: [...mutation.changedPaths],
  };
  const values = changedValues(mutation);
  const files = await Promise.all(
    mutation.changedPaths.map(async (path) => {
      if (!values.has(path)) {
        throw new Error(`Owner mutation omitted generated value for ${path}.`);
      }
      return { path, contents: await formatJson(values.get(path)) };
    }),
  );
  await writeOwnerGenerationTransaction({
    root,
    reportPath,
    files,
    reportContents: await formatJson(report),
    priorContents: final.priorContents,
    makeDirectory,
    writeFile,
    remove,
  });

  return {
    issueNumber: final.decision.issueNumber,
    projectId: final.decision.projectId,
    projectIds,
    sourceId: final.source.id,
    operation: final.decision.operation,
    publicationMode: report.publication_mode,
    authorityType: final.decision.authorityType,
    actorLogin: final.decision.actorLogin,
    generatedPaths: [...mutation.changedPaths],
    reportPath,
    report,
  };
}

function requiredOption(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function parseGenerateProjectOwnerCli(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      ![
        "--issue-number",
        "--output-directory",
        "--report-path",
        "--validated-report-path",
      ].includes(name) ||
      value === undefined
    ) {
      throw new Error(`Unknown or incomplete option: ${name ?? "missing"}.`);
    }
    options.set(name, value);
  }
  const issueNumber = Number(requiredOption(options, "--issue-number"));
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new Error("--issue-number must be a positive integer.");
  }
  return {
    issueNumber,
    root: requiredOption(options, "--output-directory"),
    reportPath: requiredOption(options, "--report-path"),
    validatedReportPath: options.get("--validated-report-path") ?? null,
  };
}

export async function readValidatedOwnerReport(
  reportPath,
  readFile = defaultReadFile,
) {
  try {
    const report = parseJson(await readFile(reportPath, "utf8"));
    if (!isRecord(report)) {
      throw new Error("report root must be an object");
    }
    return report;
  } catch (cause) {
    throw Object.assign(
      validatedReportError(
        "validated-owner-report-invalid",
        `Validated owner generation report could not be read: ${reportPath}.`,
      ),
      { cause },
    );
  }
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
    "User-Agent": "Tavernary-project-owner-generation",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { ...githubHeaders(), ...options.headers },
  });
  if (!response.ok) {
    const error = new Error(
      `GitHub ${response.status} for ${path}: ${await response.text()}`,
    );
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function main() {
  const cli = parseGenerateProjectOwnerCli(process.argv.slice(2));
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error("GITHUB_REPOSITORY is required.");
  const validatedReport = cli.validatedReportPath
    ? await readValidatedOwnerReport(cli.validatedReportPath)
    : undefined;
  await generateProjectOwnerRequest({
    issue: { number: cli.issueNumber },
    hostRepository: repository,
    root: cli.root,
    reportPath: cli.reportPath,
    request: github,
    now: new Date(),
    validatedReport,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
