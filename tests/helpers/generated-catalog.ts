import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createCatalogSearchIndex } from "@/features/search/catalog-search";
import type { TavernKeeperCardStatus } from "@/features/catalog/tavernkeeper-status";
import type { CatalogSearchFields } from "@/features/search/search-types";

interface GeneratedCatalogProject {
  id: string;
  name: string;
  kind: string;
  metadataStatus: string;
  sourceStatus: string;
  primaryFunction: string;
  catalogedAt: string;
  catalogCohort: "seed" | "standard";
  license: { status: string };
  community: { aggregate: number } | null;
  frontends: Array<{ id: string; label: string }>;
  tags: Array<{
    id: string;
    label: string;
    facet: "goal" | "trait";
    description: string;
  }>;
  search: CatalogSearchFields;
  tavernKeeper: TavernKeeperCardStatus | null;
  fork: {
    parentName: string;
    parentProjectId: string | null;
    status: "published" | "not-listed" | "unavailable";
  } | null;
  preset: {
    modelFamilies: Array<{ id: string; label: string }>;
  } | null;
}

interface GeneratedCatalogKit {
  id: string;
  title: string;
  search: CatalogSearchFields;
}

export const generatedCatalog = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/generated/catalog.json"), "utf8"),
) as {
  schemaVersion: 6;
  generatedAt: string;
  tagVocabulary: Array<{
    id: string;
    label: string;
    facet: "goal" | "trait";
    description: string;
    aliases: string[];
  }>;
  projects: GeneratedCatalogProject[];
  kits: GeneratedCatalogKit[];
};

export const generatedProjectCount = generatedCatalog.projects.length;
export const generatedKitCount = generatedCatalog.kits.length;

const generatedProjectSearchIndex = createCatalogSearchIndex(
  generatedCatalog.projects.map(({ id, search }) => ({ id, ...search })),
);

export function generatedProjectSearchCount(query: string) {
  return generatedProjectSearchIndex.search(query).matches.length;
}

export function projectCountLabel(count: number) {
  return `${count} ${count === 1 ? "project" : "projects"}`;
}

export function kitCountLabel(count: number) {
  return `${count} ${count === 1 ? "Kit" : "Kits"}`;
}

function vocabularyLength(path: string, property: string) {
  const vocabulary = JSON.parse(
    readFileSync(resolve(process.cwd(), path), "utf8"),
  ) as Record<string, unknown[]>;
  return vocabulary[property]?.length ?? 0;
}

export const metadataFilterChipCount =
  vocabularyLength("data/vocabularies/model-families.json", "model_families") +
  vocabularyLength(
    "data/vocabularies/completion-formats.json",
    "completion_formats",
  );

export const tagSearchFixture =
  generatedCatalog.tagVocabulary.find(
    ({ aliases, id }) =>
      aliases.length > 0 &&
      generatedCatalog.projects.some(({ tags }) =>
        tags.some((tag) => tag.id === id),
      ),
  ) ?? generatedCatalog.tagVocabulary[0];

function tagProjectCount(id: string) {
  return generatedCatalog.projects.filter(({ tags }) =>
    tags.some((tag) => tag.id === id),
  ).length;
}

export const tagOptionsByFacet = Object.fromEntries(
  (["goal", "trait"] as const).map((facet) => [
    facet,
    generatedCatalog.tagVocabulary
      .filter((tag) => tag.facet === facet)
      .map(({ id, label }) => ({
        id,
        label,
        count: tagProjectCount(id),
      }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label),
      ),
  ]),
) as Record<
  "goal" | "trait",
  Array<{ id: string; label: string; count: number }>
>;

const frontendVocabulary = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "data/vocabularies/frontends.json"),
    "utf8",
  ),
) as {
  frontends: Array<{ id: string; label: string }>;
};

const frontendPopularity = new Map<string, number>();
for (const project of generatedCatalog.projects) {
  if (project.kind !== "frontend" || project.community === null) continue;
  for (const frontend of project.frontends) {
    const current = frontendPopularity.get(frontend.id);
    if (current === undefined || project.community.aggregate > current) {
      frontendPopularity.set(frontend.id, project.community.aggregate);
    }
  }
}

export const frontendOptions = frontendVocabulary.frontends
  .map(({ id, label }) => ({
    id,
    label,
    count: generatedCatalog.projects.filter((project) =>
      project.frontends.some((frontend) => frontend.id === id),
    ).length,
  }))
  .sort((left, right) => {
    const leftScore = frontendPopularity.get(left.id);
    const rightScore = frontendPopularity.get(right.id);
    if (leftScore !== undefined && rightScore !== undefined) {
      const scoreOrder = rightScore - leftScore;
      if (scoreOrder !== 0) return scoreOrder;
    } else if (leftScore !== undefined) {
      return -1;
    } else if (rightScore !== undefined) {
      return 1;
    }
    return (
      left.label.localeCompare(right.label) || left.id.localeCompare(right.id)
    );
  });

export const initiallyVisibleFrontendOptions = frontendOptions.slice(0, 3);
export const collapsedFrontendOptions = frontendOptions.slice(3);
export const frontendExpansionLabel = `Show ${collapsedFrontendOptions.length} more`;
