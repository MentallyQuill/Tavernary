import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface GeneratedCatalogProject {
  metadataStatus: string;
  sourceStatus: string;
  primaryFunction: string;
  license: { status: string };
}

export const generatedCatalog = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/generated/catalog.json"), "utf8"),
) as {
  projects: GeneratedCatalogProject[];
};

export const generatedProjectCount = generatedCatalog.projects.length;
