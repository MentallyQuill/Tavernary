import { loadReadmeSource } from "./readme-source.mjs";
import { validateEnrichmentOutput } from "./enrichment-contract.mjs";
import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";

function entriesToSet(entries) {
  return new Set(
    entries.map((entry) => (typeof entry === "string" ? entry : entry.id)),
  );
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
  const hasSource = Boolean(
    source.repositoryDescription?.trim() || source.readmeText?.trim(),
  );
  if (!hasSource) {
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
  const output = await provider.generate(input);
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
