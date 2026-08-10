import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createStructuredProviderTransport } from "./enrichment-provider.mjs";
import { modelProviderOptionsFromEnvironment } from "./model-provider-configuration.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const taxonomySystemPrompt = `Discover a focused catalog taxonomy from the supplied project evidence.

Return recurring concepts that someone would deliberately search or filter for. Use only:
- goal: what a user is trying to achieve, such as persistent memory or group roleplay;
- trait: a meaningful way a project works, such as local-first or multimodal.

Treat each root README as primary evidence and its repository description as secondary. Do not propose frontend compatibility, project kind, model family, completion format, broad filler such as "customizable", names, implementation details, or one-off features. Prefer concepts likely to apply to multiple catalog projects. Return zero candidates when evidence is insufficient. Keep canonical phrases concise and mergeable across projects. Evidence must be a compact paraphrase or location cue, never a long quotation.`;

const kindOrder = new Map([
  ["frontend", 0],
  ["extension", 1],
  ["preset", 2],
]);
const facetOrder = new Map([
  ["goal", 0],
  ["trait", 1],
]);

function cleanPhrase(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

export function normalizeTagCandidateId(value) {
  return cleanPhrase(value)
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase()
    .replace(/&/gu, " and ")
    .replace(/['\u2019]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizedCandidate(candidate, observation) {
  const phrase = cleanPhrase(candidate?.phrase);
  const canonicalPhrase = cleanPhrase(
    candidate?.canonicalPhrase ?? candidate?.canonical_phrase,
  );
  if (!phrase || !canonicalPhrase) {
    throw new Error(
      `Candidate phrases are required for ${observation.projectId}`,
    );
  }
  if (!["goal", "trait"].includes(candidate?.facet)) {
    throw new Error(`Candidate facet is invalid for ${observation.projectId}`);
  }
  const id = normalizeTagCandidateId(canonicalPhrase);
  if (!id) {
    throw new Error(`Candidate ID is empty for ${observation.projectId}`);
  }
  if (!Array.isArray(candidate.evidence) || candidate.evidence.length === 0) {
    throw new Error(
      `Candidate evidence is required for ${observation.projectId}`,
    );
  }
  const evidence = candidate.evidence.map(cleanPhrase);
  if (evidence.some((reference) => !reference)) {
    throw new Error(
      `Candidate evidence is invalid for ${observation.projectId}`,
    );
  }

  return {
    id,
    phrase,
    canonicalPhrase,
    facet: candidate.facet,
    aliases: Array.isArray(candidate.aliases)
      ? candidate.aliases.map(cleanPhrase).filter(Boolean)
      : [],
    evidence,
    projectId: observation.projectId,
    kind: observation.kind,
  };
}

export function buildTagCandidateReport(observations) {
  const groups = new Map();
  const projectIds = new Set();

  for (const observation of observations) {
    if (
      !observation ||
      typeof observation.projectId !== "string" ||
      !kindOrder.has(observation.kind) ||
      !Array.isArray(observation.candidates)
    ) {
      throw new Error("Taxonomy observation is invalid");
    }
    projectIds.add(observation.projectId);
    for (const rawCandidate of observation.candidates) {
      const candidate = normalizedCandidate(rawCandidate, observation);
      const key = `${candidate.facet}:${candidate.id}`;
      const group = groups.get(key) ?? {
        id: candidate.id,
        facet: candidate.facet,
        canonicalPhrases: new Set(),
        phrases: new Set(),
        aliases: new Set(),
        projects: new Map(),
        kinds: new Set(),
      };
      group.canonicalPhrases.add(candidate.canonicalPhrase);
      group.phrases.add(candidate.phrase);
      for (const alias of candidate.aliases) group.aliases.add(alias);
      if (
        candidate.phrase.toLocaleLowerCase() !==
        candidate.canonicalPhrase.toLocaleLowerCase()
      ) {
        group.aliases.add(candidate.phrase);
      }
      const evidence = group.projects.get(candidate.projectId) ?? new Set();
      for (const reference of candidate.evidence) evidence.add(reference);
      group.projects.set(candidate.projectId, evidence);
      group.kinds.add(candidate.kind);
      groups.set(key, group);
    }
  }

  const facetsById = new Map();
  for (const group of groups.values()) {
    const facets = facetsById.get(group.id) ?? new Set();
    facets.add(group.facet);
    facetsById.set(group.id, facets);
  }

  const candidates = [...groups.values()].map((group) => {
    const label = uniqueSorted(group.canonicalPhrases)[0];
    const phrases = uniqueSorted(group.phrases);
    const warnings = [];
    if (phrases.length > 1) {
      warnings.push(`Merged candidate phrases: ${phrases.join(" | ")}`);
    }
    const otherFacets = [...(facetsById.get(group.id) ?? [])]
      .filter((facet) => facet !== group.facet)
      .sort();
    for (const otherFacet of otherFacets) {
      warnings.push(
        `Candidate ID also appears as ${otherFacet}; review whether to merge or split.`,
      );
    }

    return {
      id: group.id,
      label,
      facet: group.facet,
      frequency: group.projects.size,
      applicable_kinds: [...group.kinds].sort(
        (left, right) => kindOrder.get(left) - kindOrder.get(right),
      ),
      representative_projects: [...group.projects.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, 5)
        .map(([projectId, evidence]) => ({
          project_id: projectId,
          evidence: uniqueSorted(evidence),
        })),
      aliases: uniqueSorted(group.aliases).filter(
        (alias) => alias.toLocaleLowerCase() !== label.toLocaleLowerCase(),
      ),
      warnings,
    };
  });
  candidates.sort(
    (left, right) =>
      right.frequency - left.frequency ||
      facetOrder.get(left.facet) - facetOrder.get(right.facet) ||
      left.id.localeCompare(right.id),
  );

  return {
    schema_version: 1,
    project_count: projectIds.size,
    candidates,
  };
}

function providerBatchInput(cards, evidenceBySource) {
  const sourceIds = uniqueSorted(cards.map((card) => card.source_id));
  return {
    sources: sourceIds.map((sourceId) => ({
      sourceId,
      readme: evidenceBySource.get(sourceId)?.readme ?? null,
      repositoryDescription:
        evidenceBySource.get(sourceId)?.repositoryDescription ?? null,
    })),
    projects: cards.map((card) => ({
      id: card.id,
      sourceId: card.source_id,
      name: card.name,
      kind: card.kind,
    })),
  };
}

function validateProviderObservations(result, cards) {
  if (!Array.isArray(result)) {
    throw new Error("Taxonomy provider result must be an array");
  }
  const requested = new Map(cards.map((card) => [card.id, card]));
  const seen = new Set();
  for (const observation of result) {
    const card = requested.get(observation?.projectId);
    if (!card || seen.has(observation.projectId)) {
      throw new Error("Taxonomy provider returned unexpected project IDs");
    }
    if (
      observation.kind !== card.kind ||
      !Array.isArray(observation.candidates)
    ) {
      throw new Error(
        `Taxonomy provider result is invalid for ${observation.projectId}`,
      );
    }
    seen.add(observation.projectId);
  }
  if (seen.size !== cards.length) {
    throw new Error("Taxonomy provider omitted a requested project");
  }
  return result;
}

export async function discoverTagTaxonomy({
  cards,
  evidenceBySource,
  provider,
  batchSize = 6,
}) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 12) {
    throw new Error("Taxonomy discovery batch size must be between 1 and 12");
  }
  const sortedCards = [...cards].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const observations = [];
  for (let index = 0; index < sortedCards.length; index += batchSize) {
    const batch = sortedCards.slice(index, index + batchSize);
    const input = providerBatchInput(batch, evidenceBySource);
    const result = await provider.discover(input);
    observations.push(...validateProviderObservations(result, batch));
  }
  return buildTagCandidateReport(observations);
}

export async function writeTagCandidateReport(report, outputPath) {
  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`);
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function taxonomyResponseSchema(input) {
  const projectIds = input.projects.map(({ id }) => id);
  return {
    type: "object",
    additionalProperties: false,
    required: ["projects"],
    properties: {
      projects: {
        type: "array",
        minItems: projectIds.length,
        maxItems: projectIds.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["project_id", "candidates"],
          properties: {
            project_id: {
              type: "string",
              enum: projectIds,
            },
            candidates: {
              type: "array",
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "phrase",
                  "canonical_phrase",
                  "facet",
                  "aliases",
                  "evidence",
                ],
                properties: {
                  phrase: {
                    type: "string",
                    minLength: 1,
                    maxLength: 60,
                  },
                  canonical_phrase: {
                    type: "string",
                    minLength: 1,
                    maxLength: 60,
                  },
                  facet: {
                    type: "string",
                    enum: ["goal", "trait"],
                  },
                  aliases: {
                    type: "array",
                    maxItems: 8,
                    uniqueItems: true,
                    items: {
                      type: "string",
                      minLength: 1,
                      maxLength: 60,
                    },
                  },
                  evidence: {
                    type: "array",
                    minItems: 1,
                    maxItems: 4,
                    uniqueItems: true,
                    items: {
                      type: "string",
                      minLength: 1,
                      maxLength: 240,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function createTaxonomyDiscoveryProvider(options) {
  const transport = createStructuredProviderTransport(options);
  return {
    async discover(input) {
      const response = await transport.request({
        model: transport.configuration.model,
        temperature: 0.35,
        messages: [
          { role: "system", content: taxonomySystemPrompt },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "tavernary_tag_taxonomy_discovery",
            strict: true,
            schema: taxonomyResponseSchema(input),
          },
        },
      });
      if (!Array.isArray(response.output.projects)) {
        throw new Error("Taxonomy provider response is missing projects");
      }
      const projectsById = new Map(
        input.projects.map((project) => [project.id, project]),
      );
      return response.output.projects.map((project) => ({
        projectId: project.project_id,
        kind: projectsById.get(project.project_id)?.kind,
        candidates: Array.isArray(project.candidates)
          ? project.candidates.map((candidate) => ({
              phrase: candidate.phrase,
              canonicalPhrase: candidate.canonical_phrase,
              facet: candidate.facet,
              aliases: candidate.aliases,
              evidence: candidate.evidence,
            }))
          : project.candidates,
      }));
    },
  };
}

async function readJsonDirectory(directory) {
  const filenames = (await readdir(directory))
    .filter((filename) => filename.endsWith(".json"))
    .sort();
  return Promise.all(
    filenames.map(async (filename) =>
      JSON.parse(await readFile(resolve(directory, filename), "utf8")),
    ),
  );
}

function isRepositorySource(source) {
  return (
    (source?.type === "github" || source?.type === "codeberg") &&
    Number.isSafeInteger(source.repository_id) &&
    source.repository_id > 0
  );
}

async function readEvidenceMetadata(directory, sourceId) {
  try {
    return JSON.parse(
      await readFile(resolve(directory, "source.json"), "utf8"),
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error(
        `Missing cached evidence for ${sourceId}; run catalog:evidence:refresh -- --source ${sourceId}`,
      );
    }
    throw error;
  }
}

async function loadSourceEvidence(evidenceRoot, source) {
  if (!isRepositorySource(source)) {
    return {
      readme: null,
      repositoryDescription: null,
    };
  }
  const directory = resolve(
    evidenceRoot,
    source.type,
    String(source.repository_id),
  );
  const metadata = await readEvidenceMetadata(directory, source.id);
  if (
    metadata.source_id !== source.id ||
    metadata.provider !== source.type ||
    metadata.repository_id !== source.repository_id ||
    ![null, "string"].includes(
      metadata.readme_filename === null
        ? null
        : typeof metadata.readme_filename,
    ) ||
    ![null, "string"].includes(
      metadata.repository_description === null
        ? null
        : typeof metadata.repository_description,
    )
  ) {
    throw new Error(`Cached evidence metadata is invalid for ${source.id}`);
  }

  let readme = null;
  if (metadata.readme_filename !== null) {
    if (basename(metadata.readme_filename) !== metadata.readme_filename) {
      throw new Error(`Cached README filename is invalid for ${source.id}`);
    }
    readme = await readFile(
      resolve(directory, metadata.readme_filename),
      "utf8",
    );
  }
  return {
    readme,
    repositoryDescription: metadata.repository_description,
  };
}

export async function loadTaxonomyCorpus(options = {}) {
  const activeRepositoryRoot = options.repositoryRoot ?? repositoryRoot;
  const evidenceRoot =
    options.evidenceRoot ??
    resolve(activeRepositoryRoot, "local-data/catalog-evidence");
  const [cards, sources] = await Promise.all([
    readJsonDirectory(resolve(activeRepositoryRoot, "data/registry/projects")),
    readJsonDirectory(resolve(activeRepositoryRoot, "data/registry/sources")),
  ]);
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const evidenceBySource = new Map();

  for (const card of cards) {
    if (
      typeof card.id !== "string" ||
      typeof card.name !== "string" ||
      !kindOrder.has(card.kind) ||
      typeof card.source_id !== "string"
    ) {
      throw new Error(
        "Taxonomy discovery requires source-backed project cards",
      );
    }
    const source = sourcesById.get(card.source_id);
    if (!source) {
      throw new Error(`Unknown source ${card.source_id} for ${card.id}`);
    }
    if (!evidenceBySource.has(source.id)) {
      evidenceBySource.set(
        source.id,
        await loadSourceEvidence(evidenceRoot, source),
      );
    }
  }

  return {
    cards: cards.map(({ id, name, kind, source_id }) => ({
      id,
      name,
      kind,
      source_id,
    })),
    evidenceBySource,
  };
}

function parseTaxonomyArguments(arguments_) {
  let batchSize = 6;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] !== "--batch-size") {
      throw new Error(`Unknown argument: ${arguments_[index]}`);
    }
    const value = Number(arguments_[index + 1]);
    if (!Number.isSafeInteger(value)) {
      throw new Error("--batch-size requires an integer");
    }
    batchSize = value;
    index += 1;
  }
  if (batchSize < 1 || batchSize > 12) {
    throw new Error("Taxonomy discovery batch size must be between 1 and 12");
  }
  return { batchSize };
}

export async function runTagTaxonomyDiscoveryCli(arguments_, options = {}) {
  const { batchSize } = parseTaxonomyArguments(arguments_);
  const activeRepositoryRoot = options.repositoryRoot ?? repositoryRoot;
  const outputPath =
    options.outputPath ??
    resolve(
      activeRepositoryRoot,
      "local-data/catalog-evidence/tag-candidates.json",
    );
  const corpus =
    options.corpus ??
    (await loadTaxonomyCorpus({ repositoryRoot: activeRepositoryRoot }));
  const provider =
    options.provider ??
    createTaxonomyDiscoveryProvider({
      ...modelProviderOptionsFromEnvironment(),
    });
  const report = await discoverTagTaxonomy({
    ...corpus,
    provider,
    batchSize,
  });
  await writeTagCandidateReport(report, outputPath);
  (options.logger ?? console).log(
    JSON.stringify({
      projects: report.project_count,
      candidates: report.candidates.length,
      output: outputPath,
    }),
  );
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runTagTaxonomyDiscoveryCli(process.argv.slice(2));
}
