import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { createTavernKeeperSynthesisProvider } from "./tavernkeeper-synthesis-provider.mjs";
import { synthesizeTavernKeeperReport } from "./tavernkeeper-synthesis.mjs";
import {
  fetchAndValidateTavernKeeperIndex,
  fetchAndValidateTavernKeeperReport,
  validateReportIndex,
  validateStoredReportIndex,
  writeReportSummaries,
} from "./tavernkeeper-reports.mjs";
import { loadTavernKeeperSourceRegistry } from "./validate-tavernkeeper-reports.mjs";
import {
  blankPendingImport,
  readTavernKeeperImportState,
  rotatePendingImport,
  validateTavernKeeperImportState,
} from "./tavernkeeper-import-state.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOutputPath = resolve(
  rootDirectory,
  "data/security/tavernkeeper-report-summaries.json",
);
const defaultImportStatePath = resolve(
  rootDirectory,
  "data/security/tavernkeeper-import-state.json",
);

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
    synthesis.target_sha !== entry.target_sha
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
    isDeepStrictEqual(indexProjection(existing), entry)
  );
}

function synchronizeImportQueue(stateInput, index, existing, at) {
  const state = validateTavernKeeperImportState(stateInput);
  const current = new Map(
    index.reports.map((entry) => [entry.report_id, entry]),
  );
  const pending = state.pending.filter((entry) => {
    const source = current.get(entry.report_id);
    return (
      source !== undefined &&
      !matchingTrackedEntry(existing.get(entry.report_id), source)
    );
  });
  const queuedIds = new Set(pending.map(({ report_id }) => report_id));
  let nextTicket = state.next_ticket;
  for (const entry of index.reports) {
    if (
      matchingTrackedEntry(existing.get(entry.report_id), entry) ||
      queuedIds.has(entry.report_id)
    )
      continue;
    if (nextTicket >= Number.MAX_SAFE_INTEGER)
      throw new Error("TavernKeeper import ticket space is exhausted");
    pending.push(blankPendingImport(entry, nextTicket));
    queuedIds.add(entry.report_id);
    nextTicket += 1;
  }
  const changed =
    state.source_generated_at !== index.generated_at ||
    nextTicket !== state.next_ticket ||
    JSON.stringify(pending) !== JSON.stringify(state.pending);
  return validateTavernKeeperImportState({
    ...state,
    updated_at: changed ? at : state.updated_at,
    source_generated_at: index.generated_at,
    next_ticket: nextTicket,
    pending,
  });
}

function withoutPending(stateInput, reportId, at) {
  const state = validateTavernKeeperImportState(stateInput);
  return validateTavernKeeperImportState({
    ...state,
    updated_at: at,
    pending: state.pending.filter((entry) => entry.report_id !== reportId),
  });
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
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 20)
    throw new Error("TavernKeeper import batch size is invalid");
  const nowDate = options.now?.() ?? new Date();
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
  const existing = new Map(
    previous.reports.map((entry) => [entry.report_id, entry]),
  );
  let importState = synchronizeImportQueue(
    priorImportState,
    index,
    existing,
    now,
  );
  const additions = [];
  const synthesize =
    options.synthesizeReport ?? createDefaultSynthesis(options);
  let imported = 0;
  let failed = 0;
  const due = importState.pending
    .filter(
      ({ not_before }) =>
        not_before === null || Date.parse(not_before) <= Date.parse(now),
    )
    .sort((left, right) => left.ticket - right.ticket)
    .slice(0, batchSize);
  const sourceEntries = new Map(
    index.reports.map((entry) => [entry.report_id, entry]),
  );

  for (const pending of due) {
    const entry = sourceEntries.get(pending.report_id);
    if (!entry) continue;
    const prior = existing.get(entry.report_id);
    let tracked;
    let failureCode = null;
    if (prior && !matchingTrackedEntry(prior, entry)) {
      failureCode = "REPORT_IDENTITY_CONFLICT";
    } else {
      let report;
      try {
        report = await fetchAndValidateTavernKeeperReport(entry, options);
      } catch {
        failureCode = "REPORT_FETCH_FAILED";
      }
      if (failureCode === null) {
        let synthesis;
        try {
          synthesis = await synthesize(report);
        } catch {
          failureCode = "REPORT_SYNTHESIS_FAILED";
        }
        if (failureCode === null) {
          try {
            tracked = trackedEntry(entry, synthesis);
          } catch {
            failureCode = "REPORT_TRACKING_FAILED";
          }
        }
      }
    }
    if (failureCode !== null) {
      importState = rotatePendingImport(importState, pending, failureCode, now);
      failed += 1;
      continue;
    }
    additions.push(tracked);
    existing.set(entry.report_id, tracked);
    importState = withoutPending(importState, entry.report_id, now);
    imported += 1;
  }

  const reports =
    index.reports.length === 0
      ? []
      : [...previous.reports, ...additions].sort(
          (left, right) =>
            Date.parse(left.completed_at) - Date.parse(right.completed_at) ||
            left.report_id.localeCompare(right.report_id),
        );
  const retainedById = new Map(
    reports.map((entry) => [entry.report_id, entry]),
  );
  const priorPreferredByRepository = new Map(
    previous.preferred_report_ids.flatMap((reportId) => {
      const report = existing.get(reportId);
      return report === undefined ? [] : [[report.repository_id, report]];
    }),
  );
  const preferredReportIds = index.reports.flatMap((entry) => {
    if (matchingTrackedEntry(retainedById.get(entry.report_id), entry))
      return [entry.report_id];
    const fallback = priorPreferredByRepository.get(entry.repository_id);
    return fallback === undefined ? [] : [fallback.report_id];
  });
  const snapshot = validateStoredReportIndex(
    {
      schema_version: 5,
      generated_at: index.generated_at,
      preferred_report_ids: preferredReportIds,
      reports,
    },
    registry,
  );
  await writeReportSummaries(snapshot, outputPath);
  await writeReportSummaries(importState, importStatePath);

  const pendingDue = importState.pending.filter(
    ({ not_before }) =>
      not_before === null || Date.parse(not_before) <= Date.parse(now),
  ).length;
  const delayed = importState.pending.filter(
    ({ not_before }) =>
      not_before !== null && Date.parse(not_before) > Date.parse(now),
  );
  return {
    snapshot,
    import_state: importState,
    imported,
    failed,
    pending_due: pendingDue,
    pending_delayed: delayed.length,
    next_wake_at:
      delayed
        .map(({ not_before }) => not_before)
        .sort((left, right) => left.localeCompare(right))[0] ?? null,
    chronic_failures: importState.pending.filter(({ chronic }) => chronic)
      .length,
  };
}

export async function importTavernKeeperReports(options = {}) {
  return (await reconcileTavernKeeperReports(options)).snapshot;
}

async function main() {
  const outcome = await reconcileTavernKeeperReports({
    outputPath: defaultOutputPath,
    importStatePath: defaultImportStatePath,
  });
  console.log(
    JSON.stringify({
      imported: outcome.imported,
      failed: outcome.failed,
      preferred: outcome.snapshot.preferred_report_ids.length,
      retained: outcome.snapshot.reports.length,
      pending_due: outcome.pending_due,
      pending_delayed: outcome.pending_delayed,
      next_wake_at: outcome.next_wake_at,
      chronic_failures: outcome.chronic_failures,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
