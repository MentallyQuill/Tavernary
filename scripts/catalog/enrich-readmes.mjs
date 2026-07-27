import { loadReadmeSource } from "./readme-source.mjs";
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
import {
  createEnrichmentProvider,
  validateProviderConfiguration,
} from "./enrichment-provider.mjs";
import {
  MANUAL_ENRICHMENT_REASON_CODE,
  assertAutomaticEnrichment,
  isAutomaticEnrichment,
  manualEnrichmentExclusions,
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

function entriesToSet(entries) {
  return new Set(
    entries.map((entry) => (typeof entry === "string" ? entry : entry.id)),
  );
}

function sourceBackedPrimaryFunctions(entries) {
  return entries.filter((entry) =>
    typeof entry === "string"
      ? entry !== "uncategorized"
      : entry.id !== "uncategorized",
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

function isEligible(record, force = false) {
  if (
    !isAutomaticEnrichment(record) ||
    record.visibility !== "published" ||
    record.source?.type !== "github"
  ) {
    return false;
  }
  if (force || record.metadata_status === "provisional") return true;
  return genericSummaries.has(record.summary);
}

export function selectEnrichmentRecords(records, options = {}) {
  return records
    .filter((record) => isEligible(record, options.force))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function enrichRecord(record, snapshot, provider, options = {}) {
  if (!isAutomaticEnrichment(record)) return null;
  if (record.visibility !== "published") return null;
  if (record.source?.type !== "github") return null;
  if (record.metadata_status === "curated" && !options.force) return null;
  if (
    !options.force &&
    record.metadata_status !== "provisional" &&
    !genericSummaries.has(record.summary)
  ) {
    return null;
  }

  const source = await (options.loadSource ?? loadReadmeSource)(
    record,
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
    const fallback = {
      summary: "No README file found.",
      metadata_status: "curated",
      primary_function: "uncategorized",
      capabilities: [],
    };
    const validation = validateEnrichmentOutput(fallback, {
      primaryFunctions: entriesToSet(vocabularies.primaryFunctions),
      capabilities: entriesToSet(vocabularies.capabilities),
    });
    if (!validation.valid) throw new Error(validation.errors.join("; "));
    return fallback;
  }

  const input = {
    id: record.id,
    name: record.name,
    kind: record.kind,
    repository: record.source.repository,
    repositoryDescription: source.repositoryDescription,
    readmeText: source.readmeText,
    frontends: record.frontends ?? [],
    allowedPrimaryFunctions: sourceBackedPrimaryFunctions(
      vocabularies.primaryFunctions,
    ),
    allowedCapabilities: vocabularies.capabilities,
  };
  if (!provider?.generate) {
    throw new Error(
      "enrichment provider configuration is required for source-backed records",
    );
  }
  const generated = await provider.generate(input);
  const output = generated.output;
  const validation = validateEnrichmentOutput(output, {
    primaryFunctions: entriesToSet(vocabularies.primaryFunctions),
    capabilities: entriesToSet(vocabularies.capabilities),
  });
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  if (output.primary_function === "uncategorized") {
    throw new Error(
      "source-backed enrichment must choose a substantive primary function",
    );
  }
  return output;
}

export async function writeEnrichedRecord(
  path,
  record,
  output,
  vocabularies = {
    primaryFunctions: [
      "frontend",
      "memory-retrieval",
      "generation-reasoning",
      "character-worldbuilding",
      "rpg-systems",
      "interface-workflow",
      "developer-infrastructure",
      "uncategorized",
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
  const validation = validateEnrichmentOutput(output, {
    primaryFunctions: entriesToSet(vocabularies.primaryFunctions),
    capabilities: entriesToSet(vocabularies.capabilities),
  });
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  const current = JSON.parse(await readFile(path, "utf8"));
  assertAutomaticEnrichment(current);
  const updated = {
    ...current,
    summary: output.summary,
    metadata_status: output.metadata_status,
    primary_function: output.primary_function,
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
    primary_function: "uncategorized",
    capabilities: [],
  };
}

function validateOutput(output, vocabularies, sourceBacked) {
  const validation = validateEnrichmentOutput(output, {
    primaryFunctions: entriesToSet(vocabularies.primaryFunctions),
    capabilities: entriesToSet(vocabularies.capabilities),
  });
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
      if (error === "primary_function is not in the controlled vocabulary") {
        return "Use one allowed primary_function ID.";
      }
      if (error === "capabilities must be an array") {
        return "Return capabilities as an array.";
      }
      if (error.startsWith("capabilities contains an unknown")) {
        return "Use only allowed capability IDs.";
      }
      return "Return an object that satisfies the enrichment schema.";
    });
    return {
      valid: false,
      message: validation.errors.join("; "),
      repairHint: [...new Set(repairHints)].join(" "),
    };
  }
  if (sourceBacked && output.primary_function === "uncategorized") {
    return {
      valid: false,
      message:
        "source-backed enrichment must choose a substantive primary function",
      repairHint: "Choose one substantive allowed primary_function ID.",
    };
  }
  return { valid: true };
}

function sourceProvenance(source) {
  return {
    sourceKind: source.sourceKind,
    repositoryId: source.repositoryId,
    headSha: source.headSha,
    readmePath: source.readmePath ?? null,
    readmeRef: source.readmeRef ?? null,
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
    typeof output?.summary === "string"
      ? output.summary.slice(0, 1_000)
      : undefined;
  return {
    ...providerInput,
    repair: {
      reasonCode: "output-invalid",
      message: validation.repairHint.includes("Summary must")
        ? `${validation.repairHint} Rewrite it in 24-32 words and no more than 190 characters.`
        : validation.repairHint,
      ...(rejectedSummary === undefined ? {} : { rejectedSummary }),
    },
  };
}

async function processProject(input, id) {
  const {
    recordsById,
    snapshotsById,
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
  if (!record || !isEligible(record, force)) {
    return {
      id,
      phase,
      outcome: "skipped",
      reasonCode: record ? "record-ineligible" : "record-missing",
      message: record
        ? "Registry record is no longer eligible."
        : "Registry record is missing.",
    };
  }

  const source = await loadSource(record, snapshotsById[id], {
    validateSnapshot,
  });
  if (source.status === "source-not-ready" || source.status === "failed") {
    return {
      id,
      phase,
      outcome: source.status === "failed" ? "failed" : "source-not-ready",
      reasonCode: source.reasonCode,
      message: source.message,
    };
  }

  let output;
  let providerMetadata;
  let providerInput;
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
    providerInput = {
      id: record.id,
      name: record.name,
      kind: record.kind,
      repository: record.source.repository,
      repositoryDescription: source.repositoryDescription,
      readmeText: source.readmeText,
      frontends: record.frontends ?? [],
      allowedPrimaryFunctions: sourceBackedPrimaryFunctions(
        vocabularies.primaryFunctions,
      ),
      allowedCapabilities: vocabularies.capabilities,
    };
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
      const generated = await provider.generate(providerInput);
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
      };
    }
  }

  let validation = validateOutput(
    output,
    vocabularies,
    source.status === "ready",
  );
  if (!validation.valid && providerInput) {
    providerInput = validationRepairInput(providerInput, validation, output);
    try {
      const generated = await provider.generate(providerInput);
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
      };
    }
    validation = validateOutput(
      output,
      vocabularies,
      source.status === "ready",
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
      };
    }
    return {
      id,
      phase,
      outcome: "failed",
      reasonCode: "write-failed",
      message: "Validated enrichment could not be written.",
      ...sourceProvenance(source),
      ...(providerMetadata ? { provider: providerMetadata } : {}),
    };
  }

  return {
    id,
    phase,
    outcome: source.status === "fallback" ? "fallback" : "enriched",
    output,
    ...sourceProvenance(source),
    ...(providerMetadata ? { provider: providerMetadata } : {}),
  };
}

export async function runEnrichmentBatch(input) {
  const {
    projectIds,
    recordsById,
    snapshotsById,
    phase,
    provider,
    validateSnapshot,
    vocabularies,
    loadSource = loadReadmeSource,
    concurrency = 4,
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
  } = input;
  if (!["primary", "retry"].includes(phase)) {
    throw new Error("batch phase must be primary or retry");
  }
  return mapWithConcurrency(projectIds, concurrency, async (id) => {
    try {
      return await processProject(
        {
          recordsById,
          snapshotsById,
          phase,
          provider,
          validateSnapshot,
          vocabularies,
          loadSource,
          writeRecord,
          previousEntries,
          force,
        },
        id,
      );
    } catch (error) {
      return {
        id,
        phase,
        outcome: "failed",
        reasonCode: error.code ?? "source-load-failed",
        message: error.message ?? "Enrichment source loading failed.",
      };
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
  repository: "tavernary/provider-preflight",
  repositoryDescription:
    "A synthetic source used only to verify structured catalog enrichment.",
  readmeText: null,
  frontends: ["sillytavern"],
  allowedPrimaryFunctions: [
    {
      id: "developer-infrastructure",
      label: "Developer infrastructure",
    },
  ],
  allowedCapabilities: [{ id: "automation", label: "Automation" }],
};

export const PREFLIGHT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

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
    primaryFunctions: preflightInput.allowedPrimaryFunctions,
    capabilities: preflightInput.allowedCapabilities,
  };
  let validation = validateOutput(result.output, vocabularies, true);
  if (!validation.valid) {
    result = await generatePreflight(
      provider,
      validationRepairInput(preflightInput, validation, result.output),
      sleep,
    );
    validation = validateOutput(result.output, vocabularies, true);
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
  const snapshots = options.snapshots
    ? Array.isArray(options.snapshots)
      ? Object.fromEntries(
          options.snapshots.map((snapshot) => [snapshot.project_id, snapshot]),
        )
      : options.snapshots
    : Object.fromEntries(
        await Promise.all(
          (await readdir(resolve(root, "data/snapshots/github")))
            .filter((name) => name.endsWith(".json"))
            .map(async (name) => [
              name.slice(0, -5),
              await readJson(resolve(root, "data/snapshots/github", name)),
            ]),
        ),
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
    const eligibleIds = selectEnrichmentRecords(records, { force }).map(
      ({ id }) => id,
    );
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
    snapshotsById: snapshots,
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
    concurrency: Number(value("--concurrency", 4)),
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
