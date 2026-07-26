import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface GeneratedCatalogProject {
  metadataStatus: string;
  sourceStatus: string;
  primaryFunction: string;
  license: { status: string };
  frontends: Array<{ id: string; label: string }>;
}

export const generatedCatalog = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/generated/catalog.json"), "utf8"),
) as {
  projects: GeneratedCatalogProject[];
};

export const generatedProjectCount = generatedCatalog.projects.length;

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
