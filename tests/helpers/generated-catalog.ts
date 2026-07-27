import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface GeneratedCatalogProject {
  kind: string;
  metadataStatus: string;
  sourceStatus: string;
  primaryFunction: string;
  license: { status: string };
  frontends: Array<{ id: string; label: string }>;
  capabilities: Array<{ id: string; label: string }>;
  searchableText: string;
  fork: {
    parentName: string;
    parentProjectId: string | null;
    status: "published" | "not-listed" | "unavailable";
  } | null;
  preset: {
    modelFamilies: Array<{ id: string; label: string }>;
  } | null;
}

export const generatedCatalog = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/generated/catalog.json"), "utf8"),
) as {
  projects: GeneratedCatalogProject[];
};

export const generatedProjectCount = generatedCatalog.projects.length;

export function projectCountLabel(count: number) {
  return `${count} ${count === 1 ? "project" : "projects"}`;
}

function vocabularyLength(path: string, property: string) {
  const vocabulary = JSON.parse(
    readFileSync(resolve(process.cwd(), path), "utf8"),
  ) as Record<string, unknown[]>;
  return vocabulary[property]?.length ?? 0;
}

export const metadataFilterChipCount =
  new Set(
    generatedCatalog.projects.flatMap(({ capabilities }) =>
      capabilities.map(({ id }) => id),
    ),
  ).size +
  vocabularyLength("data/vocabularies/model-families.json", "model_families") +
  vocabularyLength(
    "data/vocabularies/completion-formats.json",
    "completion_formats",
  );

const frontendVocabulary = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "data/vocabularies/frontends.json"),
    "utf8",
  ),
) as {
  frontends: Array<{ id: string; label: string }>;
};

export const frontendOptions = frontendVocabulary.frontends.map(
  ({ id, label }) => ({
    id,
    label,
    count: generatedCatalog.projects.filter((project) =>
      project.frontends.some((frontend) => frontend.id === id),
    ).length,
  }),
);

export const initiallyVisibleFrontendOptions = frontendOptions.slice(0, 3);
export const collapsedFrontendOptions = frontendOptions.slice(3);
export const frontendExpansionLabel = `Show ${collapsedFrontendOptions.length} more`;
