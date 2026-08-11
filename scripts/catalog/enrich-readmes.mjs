import { loadEnrichmentSource } from "./enrichment-source.mjs";
import { validateEnrichmentOutput } from "./enrichment-contract.mjs";
import { generateValidatedEnrichment } from "./enrichment-attempts.mjs";
import {
  GENERATED_SUMMARY_MAX_LENGTH,
  GENERATED_SUMMARY_MIN_LENGTH,
} from "./generated-summary-contract.mjs";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createEnrichmentProvider,
  validateProviderConfiguration,
} from "./enrichment-provider.mjs";
import { modelProviderOptionsFromEnvironment } from "./model-provider-configuration.mjs";
import {
  MANUAL_ENRICHMENT_REASON_CODE,
  supportsAutomaticEnrichmentSource,
} from "./enrichment-policy.mjs";
import { metadataFieldsToGenerate } from "./metadata-policy.mjs";
import {
  createEnrichmentReport,
  isPreHardeningTerminalFullReport,
  validateEnrichmentReport,
} from "./enrichment-report.mjs";
import { formatJson } from "./json-format.mjs";
import {
  applyAttemptResults,
  approveCanaryDeployment,
  assertFullRolloutAllowed,
  createEnrichmentRunState,
  recordCheckpointPublication,
  recordFullDeployment,
  selectNextRunBatch,
} from "./enrichment-run-state.mjs";
import { createSnapshotValidator } from "./readme-source.mjs";
import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { tagVocabularyHash, tagsForKind } from "./tag-vocabulary.mjs";

const genericSummaries = new Set([
  "Generic intake details.",
  "Provisional project description.",
  "No description found.",
  "No README file found.",
]);

function forceForSelectionMode(selectionMode) {
  if (!["pending", "all-automatic"].includes(selectionMode)) {
    throw new Error(`unsupported enrichment selection mode: ${selectionMode}`);
  }
  return selectionMode === "all-automatic";
}

function durableManualExclusions(records) {
  return records
    .filter((record) => metadataFieldsToGenerate(record).length === 0)
    .map((record) => ({
      id: record.id,
      reason_code: MANUAL_ENRICHMENT_REASON_CODE,
      enrichment_note: "Summary and tags are manually managed.",
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function isEligible(record, source, force = false) {
  if (
    metadataFieldsToGenerate(record).length === 0 ||
    record.listing_status !== "active" ||
    !supportsAutomaticEnrichmentSource(source)
  ) {
    return false;
  }
  if (force || record.metadata_status === "provisional") return true;
  return genericSummaries.has(record.summary);
}

export function selectEnrichmentRecords(records, sourcesById, options = {}) {
  return records
    .filter((record) =>
      isEligible(record, sourcesById?.[record.source_id], options.force),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function enrichRecord(
  record,
  sourceRecord,
  snapshot,
  provider,
  options = {},
) {
  const requestedFields = metadataFieldsToGenerate(record);
  if (requestedFields.length === 0) return null;
  if (record.listing_status !== "active") return null;
  if (!supportsAutomaticEnrichmentSource(sourceRecord)) return null;
  if (record.metadata_status === "curated" && !options.force) return null;
  if (
    !options.force &&
    record.metadata_status !== "provisional" &&
    !genericSummaries.has(record.summary)
  ) {
    return null;
  }

  let source = await (options.loadSource ?? loadEnrichmentSource)(
    record,
    sourceRecord,
    snapshot,
    options,
  );
  const vocabularies = options.vocabularies ?? {
    tags: [],
  };
  if (source.status === "source-not-ready" || source.status === "failed") {
    throw new Error(source.message);
  }
  if (source.status === "fallback") {
    return fallbackOutput(requestedFields);
  }

  const input = providerInputForRecord(
    record,
    sourceRecord,
    source,
    vocabularies,
    options,
  );
  if (!provider?.generate) {
    throw new Error(
      "enrichment provider configuration is required for source-backed records",
    );
  }
  const validationInput = input;
  const validateCandidate = (candidate) =>
    validateOutput(candidate, record, vocabularies, validationInput);
  const generated = await generateValidatedEnrichment({
    initialInput: input,
    maxAttempts: options.maxProviderAttempts ?? 1,
    generate: (providerInput) => provider.generate(providerInput),
    validate: validateCandidate,
    repair: validationRepairInput,
  });
  let output = generated.output;
  let validation = generated.validation;
  if (!validation.valid) {
    const tagFallback =
      requestedFields.includes("tags") &&
      output &&
      typeof output === "object" &&
      !Array.isArray(output)
        ? { ...output, tags: [] }
        : null;
    const fallbackValidation = tagFallback
      ? validateCandidate(tagFallback)
      : { valid: false };
    if (fallbackValidation.valid) {
      return {
        ...tagFallback,
        tag_generation_diagnostic: "invalid-output-fell-back-empty",
      };
    }
    const error = new Error(validation.message);
    error.code = "output-invalid";
    throw error;
  }
  return output;
}

function providerInputForRecord(
  record,
  sourceRecord,
  source,
  vocabularies,
  options = {},
) {
  const repositoryParts =
    typeof sourceRecord?.repository === "string"
      ? sourceRecord.repository.split("/").filter(Boolean)
      : [];
  const protectedTerms = [
    ...new Set(
      (options.protectedTerms ?? [record.name, ...repositoryParts]).filter(
        (term) => typeof term === "string" && term.length > 0,
      ),
    ),
  ];
  const repositoryDescription =
    source.repositoryDescription ??
    (source.sourceKind === "description" ? source.text : null);
  const requestedFields = metadataFieldsToGenerate(record);
  return {
    id: record.id,
    sourceId: record.source_id,
    name: record.name,
    kind: record.kind,
    source: {
      kind: source.sourceKind,
      identity: source.sourceIdentity,
      text: source.text,
    },
    requestedFields,
    vocabularyHash: tagVocabularyHash(vocabularies),
    evidence: {
      readme:
        typeof source.readmeText === "string" && source.readmeText.length > 0
          ? {
              identity:
                source.readmeIdentity ??
                source.readmeRef ??
                source.readmePath ??
                source.sourceIdentity,
              text: source.readmeText,
            }
          : null,
      repositoryDescription,
    },
    protectedTerms,
    policyVersion: options.policyVersion ?? CATALOG_POLICY_VERSION,
    frontends: record.frontends ?? [],
    allowedTags: tagsForKind(vocabularies, record.kind),
  };
}

export async function writeEnrichedRecord(
  path,
  record,
  output,
  vocabularies = { tags: [] },
) {
  const current = JSON.parse(await readFile(path, "utf8"));
  const requestedFields = metadataFieldsToGenerate(current).filter((field) =>
    Object.hasOwn(output, field),
  );
  if (requestedFields.length === 0) {
    const error = new Error(
      `${current.id}: ${MANUAL_ENRICHMENT_REASON_CODE}: Summary and tags are manually managed.`,
    );
    error.code = MANUAL_ENRICHMENT_REASON_CODE;
    error.enrichmentNote = "Summary and tags are manually managed.";
    throw error;
  }
  const filteredOutput = Object.fromEntries(
    Object.entries(output).filter(
      ([key]) =>
        requestedFields.includes(key) ||
        (requestedFields.includes("summary") &&
          ["result", "change_reasons", "policy_signal"].includes(key)),
    ),
  );
  const validation = validateEnrichmentOutput(
    {
      ...filteredOutput,
    },
    {
      requestedFields,
      kind: current.kind,
      tagVocabulary: vocabularies,
      copyContext: {
        mode: "synthesize",
        submittedSummary: "",
        protectedTerms: [current.name].filter(Boolean),
      },
    },
  );
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  const updated = {
    ...current,
    ...(requestedFields.includes("summary")
      ? { summary: filteredOutput.summary.value }
      : {}),
    ...(requestedFields.includes("tags")
      ? { tags: filteredOutput.tags.map((entry) => entry.id) }
      : {}),
    metadata_status: "curated",
  };
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, await formatJson(updated));
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function mapWithConcurrency(items, limit, worker) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 8) {
    throw new Error("concurrency must be between 1 and 8");
  }
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
  );
  return results;
}

function fallbackOutput(requestedFields) {
  return {
    ...(requestedFields.includes("summary")
      ? {
          summary: {
            value: "No README file found.",
            evidence: ["source:confirmed-fallback"],
          },
          result: "accepted-unchanged",
          change_reasons: [],
          policy_signal: "none",
        }
      : {}),
    ...(requestedFields.includes("tags") ? { tags: [] } : {}),
  };
}

function validateOutput(output, record, vocabularies, providerInput) {
  const validation = validateEnrichmentOutput(output, {
    requestedFields: providerInput.requestedFields,
    kind: record.kind,
    tagVocabulary: vocabularies,
    copyContext: {
      mode: "synthesize",
      submittedSummary: "",
      protectedTerms: providerInput.protectedTerms,
    },
  });
  if (!validation.valid) {
    const repairHints = validation.errors.map((error) => {
      if (error === "summary must be an object") {
        return 'Return summary as an object with "value" and "evidence" fields.';
      }
      if (
        [
          "generated tag entries must be objects",
          "tags was requested but is missing",
        ].includes(error)
      ) {
        return 'Return each tag as an object with "id" and "evidence" fields.';
      }
      if (
        [
          "summary must be a non-empty string",
          "summary value must be a non-empty string",
        ].includes(error)
      ) {
        return "Summary must be a non-empty string.";
      }
      if (
        [
          "summary must be 220 characters or fewer",
          "summary value must be 220 characters or fewer",
        ].includes(error)
      ) {
        return "Summary must be at most 220 characters.";
      }
      if (
        error ===
        `summary value must be at least ${GENERATED_SUMMARY_MIN_LENGTH} characters`
      ) {
        return `Summary must contain at least ${GENERATED_SUMMARY_MIN_LENGTH} characters.`;
      }
      if (
        [
          "summary must not contain line breaks",
          "summary value must not contain line breaks",
        ].includes(error)
      ) {
        return "Summary must not contain line breaks.";
      }
      if (
        [
          "summary must not contain markdown or list syntax",
          "summary value must not contain markdown or list syntax",
        ].includes(error)
      ) {
        return "Summary must not contain Markdown or list syntax.";
      }
      if (
        error === "summary value must not contain URLs or domain-style links"
      ) {
        return "Summary must not contain URLs or domain-style links. If a dotted brand or project name resembles a domain, refer to the project generically instead.";
      }
      if (error.includes("evidence")) {
        return "Include compact source evidence references. Return every evidence reference as a non-empty single-line string of 160 characters or fewer inside summary.evidence or tags[].evidence; do not return evidence objects.";
      }
      if (
        error.includes("copy") ||
        error.startsWith("accepted-") ||
        error.startsWith("light edits") ||
        error.startsWith("policy rewrites")
      ) {
        return 'Use result "accepted-unchanged" with change_reasons [] and policy_signal "none" when synthesis needs no catalog-policy edit. For "accepted-with-light-edits", return one or more allowed light change reasons ("emoji-removed", "whitespace-normalized", "punctuation-corrected", or "obvious-spelling-corrected") and policy_signal "none". For "accepted-with-policy-rewrite", return one or more policy reasons ("graphic-wording-neutralized", "slur-removed", or "discriminatory-framing-neutralized") and policy_signal "catalog-policy-rewrite".';
      }
      if (
        error.includes("tags") ||
        error.startsWith("tag ") ||
        error.includes("generated tag")
      ) {
        return "Return zero to six unique allowed tag IDs with evidence.";
      }
      return "Return an object that satisfies the enrichment schema.";
    });
    return {
      valid: false,
      message: validation.errors.join("; "),
      repairHint: [...new Set(repairHints)].join(" "),
    };
  }
  return { valid: true };
}

function sourceProvenance(source) {
  return {
    sourceKind: source.sourceKind,
    sourceIdentity: source.sourceIdentity,
    repositoryId: source.repositoryId,
    headSha: source.headSha,
    readmePath: source.readmePath ?? null,
    readmeRef: source.readmeRef ?? null,
    redditPostId: source.redditPostId,
  };
}

function retryRepairMessage(entry) {
  if (entry.repair_hint) return entry.repair_hint;
  const diagnostics = {
    "content-missing": "Return the required JSON object in message content.",
    "content-parts-invalid": "Return only textual JSON content.",
    "json-invalid": "Return one valid JSON object without surrounding prose.",
    "json-not-object": "Return a JSON object, not an array or scalar.",
    "tool-calls-present": "Return only the JSON object without tool calls.",
  };
  return diagnostics[entry.diagnostic_code] ?? entry.message;
}

function validationRepairInput(providerInput, validation, output) {
  const rejectedSummary =
    typeof output?.summary?.value === "string"
      ? output.summary.value.slice(0, 1_000)
      : undefined;
  const bracketGuidance =
    rejectedSummary !== undefined && /[\[\]]/u.test(rejectedSummary)
      ? " Describe bracketed source syntax in ordinary words without reproducing square brackets."
      : "";
  const summaryGuidance =
    rejectedSummary === undefined
      ? validation.repairHint
      : `The rejected summary has ${rejectedSummary.length} characters. ${validation.repairHint} Keep the replacement between ${GENERATED_SUMMARY_MIN_LENGTH} and ${GENERATED_SUMMARY_MAX_LENGTH} characters as single-line plain text without Markdown, list syntax, URLs, or domain-style links.${bracketGuidance}`;
  return {
    ...providerInput,
    repair: {
      reasonCode: "output-invalid",
      message: summaryGuidance,
      ...(rejectedSummary === undefined ? {} : { rejectedSummary }),
    },
  };
}

async function processProject(input, id) {
  const {
    recordsById,
    sourcesById,
    snapshotsBySourceId,
    phase,
    provider,
    validateSnapshot,
    vocabularies,
    loadSource,
    writeRecord,
    previousEntries,
    force = false,
  } = input;
  const record = recordsById[id];
  const sourceRecord = record ? sourcesById[record.source_id] : null;
  if (record && metadataFieldsToGenerate(record).length === 0) {
    return {
      id,
      phase,
      outcome: "skipped",
      reasonCode: MANUAL_ENRICHMENT_REASON_CODE,
      enrichmentNote: "Summary and tags are manually managed.",
      message: "Registry record has no automatic metadata fields.",
    };
  }
  if (!record || !sourceRecord || !isEligible(record, sourceRecord, force)) {
    return {
      id,
      phase,
      outcome: "skipped",
      reasonCode: record ? "record-ineligible" : "record-missing",
      message: record
        ? sourceRecord
          ? "Registry record is no longer eligible."
          : "Registry source is missing."
        : "Registry record is missing.",
    };
  }

  const source = await loadSource(
    record,
    sourceRecord,
    snapshotsBySourceId[sourceRecord.id],
    {
      validateSnapshot,
    },
  );
  if (source.status === "source-not-ready" || source.status === "failed") {
    return {
      id,
      phase,
      outcome: source.status === "failed" ? "failed" : "source-not-ready",
      reasonCode: source.reasonCode,
      message: source.message,
      ...sourceProvenance(source),
    };
  }

  let output;
  let validation;
  let providerMetadata;
  let providerInput;
  let providerCallCount = 0;
  let providerRepairCallCount = 0;
  let providerRateLimitCount = 0;
  let providerLatencyMsTotal = 0;
  const providerTelemetry = () =>
    providerCallCount === 0
      ? {}
      : {
          providerCallCount,
          providerRepairCallCount,
          providerRateLimitCount,
          providerLatencyMsTotal,
        };
  const generate = async (input) => {
    providerCallCount += 1;
    if (input.repair) providerRepairCallCount += 1;
    try {
      const generated = await provider.generate(input);
      providerLatencyMsTotal += generated.metadata.latencyMs;
      return generated;
    } catch (error) {
      if (error?.code === "provider-rate-limited") {
        providerRateLimitCount += 1;
      }
      if (Number.isFinite(error?.latencyMs) && error.latencyMs >= 0) {
        providerLatencyMsTotal += error.latencyMs;
      }
      throw error;
    }
  };
  if (source.status === "fallback") {
    output = fallbackOutput(metadataFieldsToGenerate(record));
  } else {
    if (!provider?.generate) {
      return {
        id,
        phase,
        outcome: "failed",
        reasonCode: "provider-configuration-invalid",
        message: "Enrichment provider configuration is required.",
        ...sourceProvenance(source),
      };
    }
    providerInput = providerInputForRecord(
      record,
      sourceRecord,
      source,
      vocabularies,
    );
    const previousEntry = previousEntries?.[id];
    if (
      phase === "retry" &&
      typeof previousEntry?.reason_code === "string" &&
      typeof previousEntry?.message === "string"
    ) {
      providerInput.repair = {
        reasonCode: previousEntry.reason_code,
        message: retryRepairMessage(previousEntry),
      };
    }
    try {
      const generated = await generateValidatedEnrichment({
        initialInput: providerInput,
        maxAttempts: phase === "retry" ? 5 : 1,
        generate,
        validate: (candidate) =>
          validateOutput(candidate, record, vocabularies, providerInput),
        repair: validationRepairInput,
      });
      output = generated.output;
      providerMetadata = generated.metadata;
      validation = generated.validation;
    } catch (error) {
      return {
        id,
        phase,
        outcome: "failed",
        reasonCode: error.code ?? "provider-response-invalid",
        diagnosticCode: error.diagnosticCode,
        message: error.message ?? "The enrichment provider failed.",
        ...sourceProvenance(source),
        ...providerTelemetry(),
      };
    }
  }

  const validationInput =
    providerInput ??
    providerInputForRecord(record, sourceRecord, source, vocabularies);
  validation ??= validateOutput(output, record, vocabularies, validationInput);
  if (!validation.valid) {
    const tagFallback =
      validationInput.requestedFields.includes("tags") &&
      output &&
      typeof output === "object" &&
      !Array.isArray(output)
        ? { ...output, tags: [] }
        : null;
    if (tagFallback) {
      const fallbackValidation = validateOutput(
        tagFallback,
        record,
        vocabularies,
        validationInput,
      );
      if (fallbackValidation.valid) {
        output = {
          ...tagFallback,
          tag_generation_diagnostic: "invalid-output-fell-back-empty",
        };
        validation = { valid: true };
      }
    }
  }
  if (!validation.valid) {
    return {
      id,
      phase,
      outcome: "failed",
      reasonCode: "output-invalid",
      message: validation.message,
      repairHint: validation.repairHint,
      ...sourceProvenance(source),
      ...providerTelemetry(),
      ...(providerMetadata ? { provider: providerMetadata } : {}),
    };
  }
  try {
    await writeRecord(record, output, vocabularies);
  } catch (error) {
    if (error?.code === MANUAL_ENRICHMENT_REASON_CODE) {
      return {
        id,
        phase,
        outcome: "skipped",
        reasonCode: MANUAL_ENRICHMENT_REASON_CODE,
        enrichmentNote: error.enrichmentNote,
        message: "Registry record requires manual enrichment.",
        ...sourceProvenance(source),
        ...providerTelemetry(),
      };
    }
    return {
      id,
      phase,
      outcome: "failed",
      reasonCode: "write-failed",
      message: "Validated enrichment could not be written.",
      ...sourceProvenance(source),
      ...providerTelemetry(),
      ...(providerMetadata ? { provider: providerMetadata } : {}),
    };
  }

  return {
    id,
    phase,
    outcome: source.status === "fallback" ? "fallback" : "enriched",
    output,
    sourceId: record.source_id,
    requestedFields: validationInput.requestedFields,
    vocabularyHash: validationInput.vocabularyHash,
    finalTags: Array.isArray(output.tags)
      ? output.tags.map((entry) => entry.id)
      : undefined,
    tagEvidence: Array.isArray(output.tags)
      ? Object.fromEntries(
          output.tags.map((entry) => [entry.id, [...entry.evidence]]),
        )
      : undefined,
    summaryEvidence: output.summary?.evidence,
    tagGenerationDiagnostic: output.tag_generation_diagnostic,
    ...sourceProvenance(source),
    ...providerTelemetry(),
    ...(providerMetadata ? { provider: providerMetadata } : {}),
  };
}

export async function runEnrichmentBatch(input) {
  const {
    projectIds,
    recordsById,
    sourcesById,
    snapshotsBySourceId,
    phase,
    provider,
    validateSnapshot,
    vocabularies,
    loadSource = loadEnrichmentSource,
    concurrency = 6,
    writeRecord = async (record, output, allowedVocabularies) => {
      if (!record.path) {
        throw new Error(
          "writeRecord or record.path is required for batch execution",
        );
      }
      return writeEnrichedRecord(
        record.path,
        record,
        output,
        allowedVocabularies,
      );
    },
    previousEntries = {},
    force = false,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    rateLimitBackoffDelays = MODEL_RATE_LIMIT_BACKOFF_DELAYS_MS,
  } = input;
  if (!["primary", "retry"].includes(phase)) {
    throw new Error("batch phase must be primary or retry");
  }
  if (
    !Array.isArray(rateLimitBackoffDelays) ||
    rateLimitBackoffDelays.length === 0 ||
    rateLimitBackoffDelays.some(
      (delay) => !Number.isInteger(delay) || delay < 0,
    )
  ) {
    throw new Error(
      "rate-limit backoff delays must be a non-empty array of non-negative integers",
    );
  }
  let rateLimitEvents = 0;
  let backoffPending = false;
  let backoffBarrier = Promise.resolve();
  const recordRateLimit = (result) => {
    if (result.reasonCode !== "provider-rate-limited" || backoffPending) return;
    const delay =
      rateLimitBackoffDelays[
        Math.min(rateLimitEvents, rateLimitBackoffDelays.length - 1)
      ];
    rateLimitEvents += 1;
    backoffPending = true;
    backoffBarrier = backoffBarrier.then(async () => {
      await sleep(delay);
      backoffPending = false;
    });
  };
  const evidenceBySourceId = new Map();
  const loadPreparedSource = (
    project,
    sourceRecord,
    snapshot,
    sourceOptions,
  ) => {
    if (!evidenceBySourceId.has(sourceRecord.id)) {
      evidenceBySourceId.set(
        sourceRecord.id,
        Promise.resolve(
          loadSource(project, sourceRecord, snapshot, sourceOptions),
        ),
      );
    }
    return evidenceBySourceId.get(sourceRecord.id);
  };
  return mapWithConcurrency(projectIds, concurrency, async (id) => {
    await backoffBarrier;
    try {
      const result = await processProject(
        {
          recordsById,
          sourcesById,
          snapshotsBySourceId,
          phase,
          provider,
          validateSnapshot,
          vocabularies,
          loadSource: loadPreparedSource,
          writeRecord,
          previousEntries,
          force,
        },
        id,
      );
      recordRateLimit(result);
      return result;
    } catch (error) {
      const result = {
        id,
        phase,
        outcome: "failed",
        reasonCode: error.code ?? "source-load-failed",
        message: error.message ?? "Enrichment source loading failed.",
      };
      recordRateLimit(result);
      return result;
    }
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readOptionalJson(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readSnapshotEntries(directory) {
  try {
    return await Promise.all(
      (await readdir(directory))
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          const snapshot = await readJson(resolve(directory, name));
          return [snapshot.source_id, snapshot];
        }),
    );
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, await formatJson(value));
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

const preflightInput = {
  id: "provider-preflight",
  sourceId: "provider-preflight",
  name: "Provider preflight",
  kind: "extension",
  source: {
    kind: "description",
    identity: "github:tavernary/provider-preflight",
    text: "A synthetic source used only to verify structured catalog enrichment.",
  },
  frontends: ["sillytavern"],
  requestedFields: ["summary", "tags"],
  vocabularyHash: "0".repeat(64),
  evidence: {
    readme: null,
    repositoryDescription:
      "A synthetic source used only to verify structured catalog enrichment.",
  },
  protectedTerms: ["Provider preflight"],
  policyVersion: CATALOG_POLICY_VERSION,
  allowedTags: [
    {
      id: "automate-roleplay-workflows",
      label: "Automate roleplay workflows",
      facet: "goal",
      description: "Automates repeated roleplay setup or execution.",
      aliases: ["automation"],
      applicable_kinds: ["extension"],
      inclusion_guidance: ["The source describes repeatable automation."],
      exclusion_guidance: [],
    },
  ],
};

const preflightRecord = {
  id: preflightInput.id,
  kind: preflightInput.kind,
};

const preflightVocabulary = {
  schema_version: 1,
  tags: preflightInput.allowedTags,
};

export const PREFLIGHT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
export const MODEL_RATE_LIMIT_BACKOFF_DELAYS_MS = [5_000, 15_000, 30_000];

const transientPreflightCodes = new Set([
  "provider-timeout",
  "provider-network-error",
  "provider-rate-limited",
  "provider-server-error",
]);

async function generatePreflight(provider, input, sleep) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await provider.generate(input);
    } catch (error) {
      const delay = PREFLIGHT_RETRY_DELAYS_MS[attempt];
      if (!transientPreflightCodes.has(error?.code) || delay === undefined) {
        throw error;
      }
      await sleep(delay);
    }
  }
}

async function runPreflight(provider, sleep) {
  let result = await generatePreflight(provider, preflightInput, sleep);
  let validation = validateOutput(
    result.output,
    preflightRecord,
    preflightVocabulary,
    preflightInput,
  );
  if (!validation.valid) {
    result = await generatePreflight(
      provider,
      validationRepairInput(preflightInput, validation, result.output),
      sleep,
    );
    validation = validateOutput(
      result.output,
      preflightRecord,
      preflightVocabulary,
      preflightInput,
    );
  }
  if (!validation.valid) {
    throw new Error(
      `provider preflight output failed validation: ${validation.repairHint}`,
    );
  }
  return {
    mode: "preflight",
    status: "passed",
    requested_model: result.metadata.requestedModel,
    returned_model: result.metadata.returnedModel,
    latency_ms: result.metadata.latencyMs,
    validation_status: "passed",
  };
}

function providerConfiguration(options) {
  const providerOptions =
    options.providerConfiguration ?? modelProviderOptionsFromEnvironment();
  return {
    ...validateProviderConfiguration(providerOptions),
    ...(providerOptions.jsonRepair
      ? {
          jsonRepair: validateProviderConfiguration(providerOptions.jsonRepair),
        }
      : {}),
  };
}

export async function runCli(options = {}) {
  const mode = options.mode ?? "preflight";
  if (
    ![
      "preflight",
      "canary",
      "approve-canary",
      "record-canary-publication",
      "record-full-publication",
      "record-full-deployment",
      "authorize-full",
      "start",
      "resume",
    ].includes(mode)
  ) {
    throw new Error(`unsupported enrichment mode: ${mode}`);
  }
  const requestedSelectionMode = options.selectionMode ?? "pending";
  forceForSelectionMode(requestedSelectionMode);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const fullReportPath =
    options.reportPath === undefined
      ? resolve(root, "data/reports/enrichment-report.json")
      : options.reportPath;
  const canaryReportPath =
    options.canaryReportPath === undefined
      ? options.reportPath === undefined
        ? resolve(root, "data/reports/enrichment-canary.json")
        : options.reportPath
      : options.canaryReportPath;
  const reportPath = [
    "canary",
    "approve-canary",
    "record-canary-publication",
  ].includes(mode)
    ? canaryReportPath
    : fullReportPath;
  const timestamp = new Date(options.now ?? Date.now()).toISOString();
  if (mode === "approve-canary") {
    const previousReport =
      options.previousReport !== undefined
        ? options.previousReport
        : reportPath
          ? await readOptionalJson(reportPath)
          : null;
    const state = approveCanaryDeployment(
      validateEnrichmentReport(previousReport),
      {
        commitSha: options.commitSha,
        deploymentRunId: options.deploymentRunId,
        now: timestamp,
      },
    );
    const report = createEnrichmentReport(state);
    if (options.writeReport) await options.writeReport(report);
    if (reportPath) await writeJsonAtomic(reportPath, report);
    return report;
  }

  if (
    mode === "record-canary-publication" ||
    mode === "record-full-publication"
  ) {
    const previousReport =
      options.previousReport !== undefined
        ? options.previousReport
        : reportPath
          ? await readOptionalJson(reportPath)
          : null;
    const expectedMode =
      mode === "record-canary-publication" ? "canary" : "full";
    const state = validateEnrichmentReport(previousReport);
    if (state.mode !== expectedMode) {
      throw new Error(
        `${expectedMode} checkpoint publication requires a ${expectedMode} report`,
      );
    }
    const report = createEnrichmentReport(
      recordCheckpointPublication(state, {
        commitSha: options.commitSha,
        now: timestamp,
      }),
    );
    if (options.writeReport) await options.writeReport(report);
    if (reportPath) await writeJsonAtomic(reportPath, report);
    return report;
  }

  if (mode === "record-full-deployment") {
    const previousReport =
      options.previousReport !== undefined
        ? options.previousReport
        : reportPath
          ? await readOptionalJson(reportPath)
          : null;
    const report = createEnrichmentReport(
      recordFullDeployment(validateEnrichmentReport(previousReport), {
        commitSha: options.commitSha,
        deploymentRunId: options.deploymentRunId,
        now: timestamp,
      }),
    );
    if (options.writeReport) await options.writeReport(report);
    if (reportPath) await writeJsonAtomic(reportPath, report);
    return report;
  }

  const configuration = providerConfiguration(options);
  if (mode === "authorize-full") {
    const canaryReport =
      options.previousReport !== undefined
        ? options.previousReport
        : canaryReportPath
          ? await readOptionalJson(canaryReportPath)
          : null;
    const canary = validateEnrichmentReport(canaryReport);
    assertFullRolloutAllowed(
      canary,
      configuration.model,
      requestedSelectionMode,
    );
    return {
      mode: "authorize-full",
      status: "passed",
      canary_run_id: canary.run_id,
      requested_model: configuration.model,
    };
  }
  const provider =
    options.provider ??
    createEnrichmentProvider({
      ...configuration,
      timeoutMs: options.timeoutMs,
    });
  const sleep =
    options.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  if (mode === "preflight") return runPreflight(provider, sleep);

  const records =
    options.records ??
    (await Promise.all(
      (await readdir(resolve(root, "data/registry/projects")))
        .filter((name) => name.endsWith(".json"))
        .map((name) => readJson(resolve(root, "data/registry/projects", name))),
    ));
  const sources =
    options.sources ??
    (await Promise.all(
      (await readdir(resolve(root, "data/registry/sources")))
        .filter((name) => name.endsWith(".json"))
        .map((name) => readJson(resolve(root, "data/registry/sources", name))),
    ));
  const sourcesById = Object.fromEntries(
    sources.map((source) => [source.id, source]),
  );
  const snapshotsBySourceId = options.snapshots
    ? Array.isArray(options.snapshots)
      ? Object.fromEntries(
          options.snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
        )
      : options.snapshots
    : Object.fromEntries(
        (
          await Promise.all([
            readSnapshotEntries(resolve(root, "data/snapshots/github")),
            readSnapshotEntries(resolve(root, "data/snapshots/codeberg")),
          ])
        ).flat(),
      );
  const vocabularyFiles = options.vocabularies
    ? null
    : await readJson(resolve(root, "data/vocabularies/tags.json"));
  const vocabularies = options.vocabularies ?? vocabularyFiles;
  const validateSnapshot =
    options.validateSnapshot ??
    createSnapshotValidator(
      options.snapshotSchema ??
        (await readJson(
          resolve(root, "data/schemas/repository-snapshot.schema.json"),
        )),
    );
  const previousReport =
    options.previousReport !== undefined
      ? options.previousReport
      : mode === "start"
        ? canaryReportPath
          ? await readOptionalJson(canaryReportPath)
          : null
        : reportPath
          ? await readOptionalJson(reportPath)
          : null;
  let previousState = null;
  if (previousReport !== null) {
    try {
      previousState = validateEnrichmentReport(previousReport);
    } catch (error) {
      if (mode !== "canary" || !options.projectIds?.length) throw error;
    }
  }
  let state;

  if (mode === "canary") {
    if (
      previousState?.mode === "canary" &&
      previousState.status === "running" &&
      ["primary", "retry"].includes(previousState.phase)
    ) {
      if (previousState.expected_model !== configuration.model) {
        throw new Error(
          "configured model does not match the running enrichment report",
        );
      }
      if (
        options.selectionMode !== undefined &&
        previousState.selection_mode !== requestedSelectionMode
      ) {
        throw new Error(
          "selection mode does not match the running enrichment report",
        );
      }
      if (
        options.projectIds &&
        JSON.stringify([...options.projectIds].sort()) !==
          JSON.stringify(previousState.manifest)
      ) {
        throw new Error("canary resume project IDs must match its manifest");
      }
      state = previousState;
    } else {
      state = createEnrichmentRunState({
        mode: "canary",
        manifest: options.projectIds ?? [],
        runId: options.runId ?? randomUUID(),
        now: timestamp,
        model: configuration.model,
        batchSize: options.batchSize,
        concurrency: options.concurrency,
        selectionMode: requestedSelectionMode,
        manualExclusions: durableManualExclusions(records),
      });
    }
  } else if (mode === "start") {
    assertFullRolloutAllowed(
      previousState,
      configuration.model,
      requestedSelectionMode,
    );
    const previousFullReport =
      options.previousFullReport !== undefined
        ? options.previousFullReport
        : fullReportPath
          ? await readOptionalJson(fullReportPath)
          : null;
    let previousFullState = null;
    let replacingLegacyFullReport = false;
    if (previousFullReport !== null) {
      try {
        previousFullState = validateEnrichmentReport(previousFullReport);
      } catch (error) {
        if (!isPreHardeningTerminalFullReport(previousFullReport)) throw error;
        replacingLegacyFullReport = true;
      }
    }
    const force = forceForSelectionMode(requestedSelectionMode);
    const eligibleIds = selectEnrichmentRecords(records, sourcesById, {
      force,
    }).map(({ id }) => id);
    const canaryBoundaryAlreadyApplied =
      previousFullState?.mode === "full" &&
      previousFullState.phase === "complete" &&
      previousFullState.selection_mode === requestedSelectionMode &&
      previousFullState.authorized_canary_run_id === previousState.run_id;
    const canaryIds = new Set(previousState.manifest);
    const deferredIds = canaryBoundaryAlreadyApplied
      ? []
      : eligibleIds.filter((id) => canaryIds.has(id));
    const manifest = eligibleIds.filter((id) => !deferredIds.includes(id));
    state = createEnrichmentRunState({
      mode: "full",
      manifest,
      deferredIds,
      authorizedCanaryRunId: previousState.run_id,
      runId: options.runId ?? randomUUID(),
      now: timestamp,
      model: configuration.model,
      batchSize: options.batchSize,
      concurrency: options.concurrency,
      selectionMode: requestedSelectionMode,
      manualExclusions: durableManualExclusions(records),
    });
    if (replacingLegacyFullReport) {
      const replacement = createEnrichmentReport(state);
      if (options.writeReport) await options.writeReport(replacement);
      if (reportPath) await writeJsonAtomic(reportPath, replacement);
    }
  } else {
    if (
      previousState?.mode !== "full" ||
      previousState.status !== "running" ||
      !["primary", "retry"].includes(previousState.phase)
    ) {
      throw new Error("resume requires a running full enrichment report");
    }
    if (previousState.expected_model !== configuration.model) {
      throw new Error(
        "configured model does not match the running enrichment report",
      );
    }
    if (
      options.selectionMode !== undefined &&
      previousState.selection_mode !== requestedSelectionMode
    ) {
      throw new Error(
        "selection mode does not match the running enrichment report",
      );
    }
    state = previousState;
  }

  if (state.phase === "complete") {
    const report = createEnrichmentReport(state);
    if (options.writeReport) await options.writeReport(report);
    if (reportPath) await writeJsonAtomic(reportPath, report);
    return report;
  }

  const batch = selectNextRunBatch(state);
  const results = await runEnrichmentBatch({
    projectIds: batch.projectIds,
    recordsById: Object.fromEntries(
      records.map((record) => [record.id, record]),
    ),
    sourcesById,
    snapshotsBySourceId,
    phase: batch.phase,
    vocabularies,
    provider,
    validateSnapshot,
    concurrency: state.concurrency,
    loadSource: options.loadSource,
    writeRecord:
      options.writeRecord ??
      ((record, output, allowedVocabularies) =>
        writeEnrichedRecord(
          resolve(root, "data/registry/projects", `${record.id}.json`),
          record,
          output,
          allowedVocabularies,
        )),
    previousEntries: state.entries,
    force: forceForSelectionMode(state.selection_mode),
  });
  state = applyAttemptResults(state, results, timestamp);
  const report = createEnrichmentReport(state);
  if (options.writeReport) await options.writeReport(report);
  if (reportPath) await writeJsonAtomic(reportPath, report);
  return report;
}

export function cliOptions(argv) {
  const values = (name) =>
    argv.flatMap((value, index) =>
      value === name && argv[index + 1] !== undefined ? [argv[index + 1]] : [],
    );
  const value = (name, fallback) => values(name).at(-1) ?? fallback;
  return {
    mode: value("--mode", "preflight"),
    timeoutMs: Number(value("--timeout-seconds", 120)) * 1_000,
    batchSize: Number(value("--batch-size", 20)),
    concurrency: Number(value("--concurrency", 6)),
    projectIds: values("--project-id"),
    commitSha: value("--commit-sha", undefined),
    deploymentRunId: Number(value("--deployment-run-id", Number.NaN)),
    reportPath: value("--report-path", undefined),
    canaryReportPath: value("--canary-report-path", undefined),
    selectionMode: value("--selection-mode", "pending"),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli(cliOptions(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exitCode = 1;
    });
}
