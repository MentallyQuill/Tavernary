import { loadEnrichmentSource } from "./enrichment-source.mjs";
import { validateEnrichmentOutput } from "./enrichment-contract.mjs";
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
import { EXTENSION_PRIMARY_FUNCTION_IDS } from "../../src/features/catalog/primary-function-contract.mjs";
import {
  createEnrichmentProvider,
  validateProviderConfiguration,
} from "./enrichment-provider.mjs";
import {
  MANUAL_ENRICHMENT_REASON_CODE,
  assertAutomaticEnrichment,
  isAutomaticEnrichment,
  manualEnrichmentExclusions,
  supportsAutomaticEnrichmentSource,
} from "./enrichment-policy.mjs";
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

function entriesToSet(entries) {
  return new Set(
    entries.map((entry) => (typeof entry === "string" ? entry : entry.id)),
  );
}

function extensionPrimaryFunctions(entries) {
  const extensionIds = new Set(EXTENSION_PRIMARY_FUNCTION_IDS);
  return entries.filter((entry) =>
    extensionIds.has(typeof entry === "string" ? entry : entry.id),
  );
}

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
  return manualEnrichmentExclusions(records).map((entry) => ({
    id: entry.projectId,
    reason_code: entry.reason,
    enrichment_note: entry.note,
  }));
}

function isEligible(record, source, force = false) {
  if (
    !isAutomaticEnrichment(record) ||
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
  if (!isAutomaticEnrichment(record)) return null;
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
    primaryFunctions: [],
    capabilities: [],
  };
  if (source.status === "source-not-ready" || source.status === "failed") {
    throw new Error(source.message);
  }
  if (source.status === "fallback") {
    const submittedDescription =
      typeof options.submittedDescription === "string"
        ? options.submittedDescription.trim()
        : "";
    if (!submittedDescription) {
      const fallback = {
        summary: "No README file found.",
        metadata_status: "curated",
        capabilities: [],
        classification_review: null,
        result: "accepted-unchanged",
        change_reasons: [],
        policy_signal: "none",
      };
      const validation = validateEnrichmentOutput(
        fallback,
        {
          capabilities: entriesToSet(vocabularies.capabilities),
        },
        null,
        {
          mode: "synthesize",
          submittedSummary: "",
          protectedTerms: [],
        },
      );
      if (!validation.valid) throw new Error(validation.errors.join("; "));
      return fallback;
    }
    source = {
      ...source,
      status: "ready",
      text: submittedDescription,
      repositoryDescription: null,
      readmeText: null,
      readmeIdentity: null,
    };
  }

  const input = providerInputForRecord(
    record,
    sourceRecord,
    source,
    vocabularies,
    options.classificationReviewRequest,
    options,
  );
  if (!provider?.generate) {
    throw new Error(
      "enrichment provider configuration is required for source-backed records",
    );
  }
  let generated = await provider.generate(input);
  let output = generated.output;
  let validation = validateEnrichmentOutput(
    output,
    {
      capabilities: entriesToSet(vocabularies.capabilities),
    },
    input.classificationReviewRequest ?? null,
    {
      mode: input.summaryMode,
      submittedSummary: input.submittedDescription ?? "",
      protectedTerms: input.protectedTerms,
    },
  );
  if (!validation.valid) {
    generated = await provider.generate({
      ...input,
      repair: {
        reasonCode: "output-invalid",
        message: [...new Set(validation.errors)].join("; "),
      },
    });
    output = generated.output;
    validation = validateEnrichmentOutput(
      output,
      {
        capabilities: entriesToSet(vocabularies.capabilities),
      },
      input.classificationReviewRequest ?? null,
      {
        mode: input.summaryMode,
        submittedSummary: input.submittedDescription ?? "",
        protectedTerms: input.protectedTerms,
      },
    );
  }
  if (!validation.valid) {
    const error = new Error([...new Set(validation.errors)].join("; "));
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
  classificationReviewRequest = null,
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
  const submittedDescription =
    options.submittedDescription ?? record.summary ?? null;
  const repositoryDescription =
    source.repositoryDescription ??
    (source.sourceKind === "description" ? source.text : null);
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    source: {
      kind: source.sourceKind,
      identity: source.sourceIdentity,
      text: source.text,
    },
    summaryMode: options.summaryMode ?? "synthesize",
    submittedDescription,
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
      submissionDescription: submittedDescription,
    },
    protectedTerms,
    policyVersion: options.policyVersion ?? CATALOG_POLICY_VERSION,
    frontends: record.frontends ?? [],
    allowedCapabilities: vocabularies.capabilities,
    ...(classificationReviewRequest ? { classificationReviewRequest } : {}),
  };
}

export async function writeEnrichedRecord(
  path,
  record,
  output,
  vocabularies = {
    primaryFunctions: [
      "frontend",
      "preset",
      "memory-retrieval",
      "generation-reasoning",
      "character-worldbuilding",
      "rpg-systems",
      "interface-workflow",
      "developer-infrastructure",
    ],
    capabilities: [
      "automation",
      "character-worldbuilding",
      "extension-development",
      "image-generation",
      "instruction-control",
      "model-routing",
      "multi-frontend",
      "planning-reasoning",
      "prompt-engineering",
      "review-validation",
    ],
  },
) {
  const current = JSON.parse(await readFile(path, "utf8"));
  assertAutomaticEnrichment(current);
  const classificationReviewRequest = output.classification_review
    ? {
        submittedPrimaryFunction: current.primary_function,
        allowedPrimaryFunctions: extensionPrimaryFunctions(
          vocabularies.primaryFunctions,
        ),
      }
    : null;
  const validation = validateEnrichmentOutput(
    output,
    {
      capabilities: entriesToSet(vocabularies.capabilities),
    },
    classificationReviewRequest,
  );
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  const updated = {
    ...current,
    summary: output.summary,
    metadata_status: output.metadata_status,
    capabilities: output.capabilities,
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

function fallbackOutput() {
  return {
    summary: "No README file found.",
    metadata_status: "curated",
    capabilities: [],
    classification_review: null,
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  };
}

function validateOutput(
  output,
  vocabularies,
  classificationReviewRequest = null,
) {
  const validation = validateEnrichmentOutput(
    output,
    {
      capabilities: entriesToSet(vocabularies.capabilities),
    },
    classificationReviewRequest,
  );
  if (!validation.valid) {
    const repairHints = validation.errors.map((error) => {
      if (error === "summary must be a non-empty string") {
        return "Summary must be a non-empty string.";
      }
      if (error === "summary must be 220 characters or fewer") {
        return "Summary must be at most 220 characters.";
      }
      if (error === "summary must contain between 24 and 36 words") {
        return "Summary must contain 24-36 words.";
      }
      if (error === "summary must not contain line breaks") {
        return "Summary must not contain line breaks.";
      }
      if (error === "summary must not contain markdown or list syntax") {
        return "Summary must not contain Markdown or list syntax.";
      }
      if (error === "summary must be exactly two sentences") {
        return "Summary must be exactly two sentences.";
      }
      if (error === "metadata_status must be curated") {
        return "Set metadata_status to curated.";
      }
      if (error === "capabilities must be an array") {
        return "Return capabilities as an array.";
      }
      if (error.startsWith("capabilities contains an unknown")) {
        return "Use only allowed capability IDs.";
      }
      if (error.startsWith("classification_review")) {
        return "Return the requested bounded classification_review value.";
      }
      if (error === "primary_function is not allowed in enrichment output") {
        return "Do not return primary_function.";
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

function summaryMeasurements(summary) {
  const words = summary.trim().split(/\s+/u).filter(Boolean).length;
  const sentences = summary.match(/[.!?](?=\s|$)/gu)?.length ?? 0;
  return `${words} words, ${summary.length} characters, and ${sentences} sentences`;
}

function validationRepairInput(providerInput, validation, output) {
  const rejectedSummary =
    typeof output?.summary === "string"
      ? output.summary.slice(0, 1_000)
      : undefined;
  const summaryGuidance =
    rejectedSummary === undefined
      ? validation.repairHint
      : `The rejected summary has ${summaryMeasurements(rejectedSummary)}. ${validation.repairHint} Prefer 24-30 words and 160-200 characters while keeping the hard limits of 24-36 words and 220 characters.`;
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
  if (record && !isAutomaticEnrichment(record)) {
    return {
      id,
      phase,
      outcome: "skipped",
      reasonCode: MANUAL_ENRICHMENT_REASON_CODE,
      enrichmentNote: record.enrichment_note,
      message: "Registry record requires manual enrichment.",
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
    output = fallbackOutput();
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
      const generated = await generate(providerInput);
      output = generated.output;
      providerMetadata = generated.metadata;
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

  let validation = validateOutput(
    output,
    vocabularies,
    providerInput?.classificationReviewRequest ?? null,
  );
  if (!validation.valid && providerInput) {
    providerInput = validationRepairInput(providerInput, validation, output);
    try {
      const generated = await generate(providerInput);
      output = generated.output;
      providerMetadata = generated.metadata;
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
    validation = validateOutput(
      output,
      vocabularies,
      providerInput?.classificationReviewRequest ?? null,
    );
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
  name: "Provider preflight",
  kind: "extension",
  source: {
    kind: "description",
    identity: "github:tavernary/provider-preflight",
    text: "A synthetic source used only to verify structured catalog enrichment.",
  },
  frontends: ["sillytavern"],
  allowedCapabilities: [{ id: "automation", label: "Automation" }],
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
  const vocabularies = {
    primaryFunctions: [],
    capabilities: preflightInput.allowedCapabilities,
  };
  let validation = validateOutput(result.output, vocabularies);
  if (!validation.valid) {
    result = await generatePreflight(
      provider,
      validationRepairInput(preflightInput, validation, result.output),
      sleep,
    );
    validation = validateOutput(result.output, vocabularies);
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
  return validateProviderConfiguration(
    options.providerConfiguration ?? {
      apiUrl: process.env.TAVERNARY_ENRICHMENT_API_URL,
      apiKey: process.env.TAVERNARY_ENRICHMENT_API_KEY,
      model: process.env.TAVERNARY_ENRICHMENT_MODEL,
    },
  );
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
    : await Promise.all([
        readJson(resolve(root, "data/vocabularies/primary-functions.json")),
        readJson(resolve(root, "data/vocabularies/capabilities.json")),
      ]);
  const vocabularies = options.vocabularies ?? {
    primaryFunctions: vocabularyFiles[0].primary_functions,
    capabilities: vocabularyFiles[1].capabilities,
  };
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
