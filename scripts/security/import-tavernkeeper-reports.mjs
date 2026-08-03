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

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultOutputPath = resolve(
  rootDirectory,
  "data/security/tavernkeeper-report-summaries.json",
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

export async function importTavernKeeperReports(options = {}) {
  const root = options.root ?? rootDirectory;
  const outputPath =
    options.outputPath ??
    resolve(root, "data/security/tavernkeeper-report-summaries.json");
  const registry =
    options.registry ?? (await loadTavernKeeperSourceRegistry(root));
  const index = validateReportIndex(
    await fetchAndValidateTavernKeeperIndex(options),
    registry,
  );
  const previous = await readPrevious(outputPath, registry);
  const existing = new Map(
    previous.reports.map((entry) => [entry.report_id, entry]),
  );
  const additions = [];
  const synthesize =
    options.synthesizeReport ?? createDefaultSynthesis(options);

  for (const entry of index.reports) {
    const prior = existing.get(entry.report_id);
    if (prior) {
      if (!isDeepStrictEqual(indexProjection(prior), entry)) {
        throw new Error(
          "Tracked TavernKeeper report identity conflicts with the preferred index",
        );
      }
      continue;
    }
    const report = await fetchAndValidateTavernKeeperReport(entry, options);
    additions.push(trackedEntry(entry, await synthesize(report)));
  }

  const reports = [...previous.reports, ...additions].sort(
    (left, right) =>
      Date.parse(left.completed_at) - Date.parse(right.completed_at) ||
      left.report_id.localeCompare(right.report_id),
  );
  const snapshot = validateStoredReportIndex(
    {
      schema_version: 5,
      generated_at: index.generated_at,
      preferred_report_ids: index.reports.map((entry) => entry.report_id),
      reports,
    },
    registry,
  );
  await writeReportSummaries(snapshot, outputPath);
  return snapshot;
}

async function main() {
  const summaries = await importTavernKeeperReports({
    outputPath: defaultOutputPath,
  });
  console.log(
    `Imported ${summaries.preferred_report_ids.length} preferred TavernKeeper reports with ${summaries.reports.length} retained assessments`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
