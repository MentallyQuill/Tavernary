import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { TAVERNKEEPER_SYNTHESIS_POLICY_VERSION } from "./tavernkeeper-assessment-contract.mjs";
import {
  migrateTavernKeeperImportState,
  quarantineTavernKeeperReport,
  readTavernKeeperImportState,
  removeTavernKeeperQuarantine,
  reportSynthesisIncidentKey,
  validateTavernKeeperImportState,
} from "./tavernkeeper-import-state.mjs";
import {
  fetchAndValidateTavernKeeperIndex,
  fetchAndValidateTavernKeeperReport,
  validateReportIndex,
  validateStoredReportIndex,
  writeReportSummaries,
} from "./tavernkeeper-reports.mjs";
import { createTavernKeeperSynthesisProvider } from "./tavernkeeper-synthesis-provider.mjs";
import {
  synthesizeTavernKeeperReport,
  TavernKeeperSynthesisError,
} from "./tavernkeeper-synthesis.mjs";
import { loadTavernKeeperSourceRegistry } from "./validate-tavernkeeper-reports.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOutputPath = resolve(
  rootDirectory,
  "data/security/tavernkeeper-report-summaries.json",
);
const defaultImportStatePath = resolve(
  rootDirectory,
  "data/security/tavernkeeper-import-state.json",
);
const digestPattern = /^[0-9a-f]{64}$/u;

function indexProjection(entry) {
  const {
    assessed_at: _assessedAt,
    synthesis_policy_version: _policy,
    synthesis_model: _model,
    assessment: _assessment,
    ...indexEntry
  } = entry;
  return indexEntry;
}

function trackedEntry(entry, synthesis) {
  if (
    synthesis.report_id !== entry.report_id ||
    synthesis.target_sha !== entry.target_sha ||
    synthesis.synthesis_policy_version !== TAVERNKEEPER_SYNTHESIS_POLICY_VERSION
  ) {
    throw new Error(
      "Tavernary synthesis identity does not match the V5 report",
    );
  }
  return {
    ...entry,
    assessed_at: synthesis.assessed_at,
    synthesis_policy_version: synthesis.synthesis_policy_version,
    synthesis_model: synthesis.synthesis_model,
    assessment: synthesis.assessment,
  };
}

async function readPrevious(path, registry) {
  const input = JSON.parse(await readFile(path, "utf8"));
  return validateStoredReportIndex(input, registry);
}

function createDefaultSynthesis(options) {
  let provider;
  return async (report) => {
    provider ??= createTavernKeeperSynthesisProvider({
      apiUrl: options.apiUrl ?? process.env.TAVERNARY_ENRICHMENT_API_URL,
      apiKey: options.apiKey ?? process.env.TAVERNARY_ENRICHMENT_API_KEY,
      model: options.model ?? process.env.TAVERNARY_ENRICHMENT_MODEL,
      fetchImpl: options.providerFetchImpl,
      timeoutMs: options.providerTimeoutMs,
      now: options.providerNow,
    });
    return synthesizeTavernKeeperReport(report, {
      provider,
      maxAttempts: options.synthesisMaxAttempts,
      now: options.assessmentNow,
    });
  };
}

function matchingTrackedEntry(existing, entry) {
  return (
    existing !== undefined &&
    existing.synthesis_policy_version ===
      TAVERNKEEPER_SYNTHESIS_POLICY_VERSION &&
    isDeepStrictEqual(indexProjection(existing), entry)
  );
}

function incidentProjection(quarantine) {
  return {
    incident_key: reportSynthesisIncidentKey(
      quarantine.report_digest,
      quarantine.synthesis_policy_version,
    ),
    report_id: quarantine.report_id,
    report_digest: quarantine.report_digest,
    repository_id: quarantine.repository_id,
    repository: quarantine.repository,
    target_sha: quarantine.target_sha,
    synthesis_policy_version: quarantine.synthesis_policy_version,
    diagnostic: quarantine.diagnostic,
    attempts: quarantine.attempts,
  };
}

function currentQuarantine(state, reportDigest) {
  return state.quarantines.find(
    (entry) =>
      entry.report_digest === reportDigest &&
      entry.synthesis_policy_version === TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
  );
}

function retainCurrentQuarantines(stateInput, index, at) {
  const state = validateTavernKeeperImportState(stateInput);
  const current = new Map(
    index.reports.map((entry) => [entry.report_digest, entry]),
  );
  const quarantines = state.quarantines.filter((entry) => {
    const indexed = current.get(entry.report_digest);
    return (
      indexed !== undefined &&
      indexed.report_id === entry.report_id &&
      entry.synthesis_policy_version === TAVERNKEEPER_SYNTHESIS_POLICY_VERSION
    );
  });
  const retained = new Set(quarantines.map((entry) => entry));
  const resolved = state.quarantines
    .filter((entry) => !retained.has(entry))
    .map(incidentProjection);
  return {
    state: validateTavernKeeperImportState({
      ...state,
      updated_at:
        quarantines.length === state.quarantines.length ? state.updated_at : at,
      quarantines,
    }),
    resolved,
  };
}

function validateRetryDigest(value, index) {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    !digestPattern.test(value) ||
    !index.reports.some(({ report_digest }) => report_digest === value)
  ) {
    throw new Error("TavernKeeper retry report digest is invalid");
  }
  return value;
}

function uniqueIncidents(items) {
  return [
    ...new Map(items.map((item) => [item.incident_key, item])).values(),
  ].sort((left, right) => left.incident_key.localeCompare(right.incident_key));
}

export async function reconcileTavernKeeperReports(options = {}) {
  const root = options.root ?? rootDirectory;
  const outputPath =
    options.outputPath ??
    resolve(root, "data/security/tavernkeeper-report-summaries.json");
  const importStatePath =
    options.importStatePath ??
    resolve(root, "data/security/tavernkeeper-import-state.json");
  const batchSize = options.batchSize ?? 5;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 20) {
    throw new Error("TavernKeeper import batch size is invalid");
  }
  const nowDate = options.now?.() ?? new Date();
  if (!(nowDate instanceof Date) || !Number.isFinite(nowDate.getTime())) {
    throw new Error("TavernKeeper import time is invalid");
  }
  const now = nowDate.toISOString();
  const registry =
    options.registry ?? (await loadTavernKeeperSourceRegistry(root));
  const index = validateReportIndex(
    await fetchAndValidateTavernKeeperIndex(options),
    registry,
  );
  const [previous, priorImportState] = await Promise.all([
    readPrevious(outputPath, registry),
    readTavernKeeperImportState(importStatePath),
  ]);
  if (Date.parse(index.generated_at) < Date.parse(previous.generated_at)) {
    throw new Error(
      "TavernKeeper report index is older than the tracked assessment snapshot",
    );
  }

  const migrated = migrateTavernKeeperImportState(priorImportState, index, now);
  const retainedQuarantines = retainCurrentQuarantines(migrated, index, now);
  let importState = retainedQuarantines.state;
  const resolved = [...retainedQuarantines.resolved];
  const createdOrUpdated = [];
  const retryReportDigest = validateRetryDigest(
    options.retryReportDigest,
    index,
  );
  const existing = new Map(
    previous.reports.map((entry) => [entry.report_id, entry]),
  );
  const synthesize =
    options.synthesizeReport ?? createDefaultSynthesis(options);
  const eligible = index.reports.filter((entry) => {
    if (retryReportDigest === entry.report_digest) return true;
    if (currentQuarantine(importState, entry.report_digest) !== undefined) {
      return false;
    }
    return !matchingTrackedEntry(existing.get(entry.report_id), entry);
  });
  const skippedQuarantines = index.reports.filter(
    (entry) =>
      retryReportDigest !== entry.report_digest &&
      currentQuarantine(importState, entry.report_digest) !== undefined,
  ).length;
  const additions = [];
  let imported = 0;
  let quarantined = 0;

  for (const entry of eligible.slice(0, batchSize)) {
    const prior = existing.get(entry.report_id);
    if (
      prior !== undefined &&
      !isDeepStrictEqual(indexProjection(prior), entry)
    ) {
      throw new Error(
        "Tracked TavernKeeper report identity conflicts with index",
      );
    }
    const report = await fetchAndValidateTavernKeeperReport(entry, options);
    let synthesis;
    try {
      synthesis = await synthesize(report);
    } catch (error) {
      if (
        error instanceof TavernKeeperSynthesisError &&
        error.kind === "invalid-output"
      ) {
        importState = quarantineTavernKeeperReport(
          importState,
          entry,
          TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
          error.diagnostic,
          now,
        );
        createdOrUpdated.push(
          incidentProjection(
            currentQuarantine(importState, entry.report_digest),
          ),
        );
        quarantined += 1;
        continue;
      }
      throw error;
    }
    const tracked = trackedEntry(entry, synthesis);
    const recovered = currentQuarantine(importState, entry.report_digest);
    if (recovered !== undefined) resolved.push(incidentProjection(recovered));
    importState = removeTavernKeeperQuarantine(
      importState,
      entry.report_digest,
      TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
      now,
    );
    additions.push(tracked);
    existing.set(entry.report_id, tracked);
    imported += 1;
  }

  const reports =
    index.reports.length === 0
      ? []
      : [
          ...new Map(
            [...previous.reports, ...additions].map((entry) => [
              entry.report_id,
              entry,
            ]),
          ).values(),
        ].sort(
          (left, right) =>
            Date.parse(left.completed_at) - Date.parse(right.completed_at) ||
            left.report_id.localeCompare(right.report_id),
        );
  const retainedById = new Map(
    reports.map((entry) => [entry.report_id, entry]),
  );
  const preferredReportIds = index.reports.flatMap((entry) =>
    currentQuarantine(importState, entry.report_digest) === undefined &&
    matchingTrackedEntry(retainedById.get(entry.report_id), entry)
      ? [entry.report_id]
      : [],
  );
  const snapshot = validateStoredReportIndex(
    {
      schema_version: 5,
      generated_at: index.generated_at,
      preferred_report_ids: preferredReportIds,
      reports,
    },
    registry,
  );
  importState = validateTavernKeeperImportState(importState);
  await writeReportSummaries(snapshot, outputPath);
  await writeReportSummaries(importState, importStatePath);

  const remaining = index.reports.filter(
    (entry) =>
      !matchingTrackedEntry(retainedById.get(entry.report_id), entry) &&
      currentQuarantine(importState, entry.report_digest) === undefined,
  ).length;
  return {
    snapshot,
    import_state: importState,
    imported,
    retained: snapshot.reports.length,
    quarantined,
    skipped_quarantines: skippedQuarantines,
    remaining,
    created_or_updated: uniqueIncidents(createdOrUpdated),
    resolved: uniqueIncidents(resolved),
  };
}

export async function importTavernKeeperReports(options = {}) {
  return (await reconcileTavernKeeperReports(options)).snapshot;
}

async function main() {
  const outcome = await reconcileTavernKeeperReports({
    outputPath: defaultOutputPath,
    importStatePath: defaultImportStatePath,
    retryReportDigest: process.env.TAVERNARY_RETRY_REPORT_DIGEST,
  });
  console.log(
    JSON.stringify({
      imported: outcome.imported,
      retained: outcome.retained,
      quarantined: outcome.quarantined,
      skipped_quarantines: outcome.skipped_quarantines,
      remaining: outcome.remaining,
      created_or_updated: outcome.created_or_updated,
      resolved: outcome.resolved,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
