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
import { createEnrichmentProvider } from "./enrichment-provider.mjs";
import { createEnrichmentReport } from "./enrichment-report.mjs";

function entriesToSet(entries) {
  return new Set(
    entries.map((entry) => (typeof entry === "string" ? entry : entry.id)),
  );
}

function isEligible(record, force = false) {
  if (record.visibility !== "published" || record.source?.type !== "github") {
    return false;
  }
  if (force || record.metadata_status === "provisional") return true;
  return new Set([
    "Generic intake details.",
    "Provisional project description.",
    "No description found.",
    "No README file found.",
  ]).has(record.summary);
}

export function selectEnrichmentRecords(records, options = {}) {
  const sorted = records
    .filter((record) => isEligible(record, options.force))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (options.projectId) {
    return sorted.filter((record) => record.id === options.projectId);
  }
  const startIndex = Math.max(0, options.startIndex ?? 0);
  const batchSize = Math.max(1, options.batchSize ?? 20);
  return sorted.slice(startIndex, startIndex + batchSize);
}

export async function enrichRecord(record, snapshot, provider, options = {}) {
  if (record.visibility !== "published") return null;
  if (record.source?.type !== "github") return null;
  if (record.metadata_status === "curated" && !options.force) return null;
  const genericSummary = new Set([
    "Generic intake details.",
    "Provisional project description.",
    "No description found.",
    "No README file found.",
  ]);
  if (
    !options.force &&
    record.metadata_status !== "provisional" &&
    !genericSummary.has(record.summary)
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
    allowedPrimaryFunctions: vocabularies.primaryFunctions,
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
  const updated = {
    ...current,
    summary: output.summary,
    metadata_status: output.metadata_status,
    primary_function: output.primary_function,
    capabilities: output.capabilities,
  };
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(updated, null, 2)}\n`);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function runEnrichmentBatch({
  records,
  snapshots,
  vocabularies,
  provider,
  loadSource,
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
  now = new Date().toISOString(),
  force = false,
}) {
  const enriched = [];
  const fallback = [];
  const skipped = [];
  const failed = [];
  for (const record of records) {
    try {
      const output = await enrichRecord(
        record,
        snapshots[record.id],
        provider,
        {
          force,
          vocabularies,
          loadSource,
        },
      );
      if (!output) {
        skipped.push(record.id);
        continue;
      }
      await writeRecord(record, output, vocabularies);
      if (output.summary === "No README file found.") fallback.push(record.id);
      else enriched.push(record.id);
    } catch (error) {
      failed.push({ id: record.id, reason: error.message });
    }
  }
  return { generatedAt: now, enriched, fallback, skipped, failed };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function runCli(options = {}) {
  if (options.mode && options.mode !== "backfill") {
    throw new Error(`unsupported enrichment mode: ${options.mode}`);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const records =
    options.records ??
    (await Promise.all(
      (await readdir(resolve(root, "data/registry/projects")))
        .filter((name) => name.endsWith(".json"))
        .map((name) => readJson(resolve(root, "data/registry/projects", name))),
    ));
  const snapshots =
    options.snapshots ??
    Object.fromEntries(
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
  const selected = selectEnrichmentRecords(records, options);
  const result = await runEnrichmentBatch({
    records: selected,
    snapshots,
    vocabularies,
    provider:
      options.provider ??
      (process.env.TAVERNARY_ENRICHMENT_API_URL
        ? createEnrichmentProvider({
            apiUrl: process.env.TAVERNARY_ENRICHMENT_API_URL,
            apiKey: process.env.TAVERNARY_ENRICHMENT_API_KEY,
            model: process.env.TAVERNARY_ENRICHMENT_MODEL,
          })
        : undefined),
    now: options.now,
    force: options.force,
    writeRecord:
      options.writeRecord ??
      ((record, output, allowedVocabularies) =>
        writeEnrichedRecord(
          resolve(root, "data/registry/projects", `${record.id}.json`),
          record,
          output,
          allowedVocabularies,
        )),
  });
  const report = createEnrichmentReport(result.generatedAt, result);
  const reportPath =
    options.reportPath ?? resolve(root, "data/reports/enrichment-report.json");
  if (reportPath) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (report.failed.length > 0) {
    throw new Error(
      `enrichment batch failed for ${report.failed.length} record(s)`,
    );
  }
  return report;
}

function cliOptions(argv) {
  const value = (name, fallback) => {
    const index = argv.indexOf(name);
    return index < 0 ? fallback : argv[index + 1];
  };
  return {
    mode: value("--mode", "backfill"),
    startIndex: Number(value("--start-index", 0)),
    batchSize: Number(value("--batch-size", 20)),
    projectId: value("--project-id", undefined),
    force: argv.includes("--force"),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli(cliOptions(process.argv.slice(2))).catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
