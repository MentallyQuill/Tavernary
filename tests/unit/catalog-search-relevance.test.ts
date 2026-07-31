import { beforeAll, describe, expect, test } from "vitest";

import scenariosJson from "../fixtures/catalog-search-relevance.json";
import { buildCatalog } from "../../scripts/catalog/build.mjs";
import { createCatalogSearchIndex } from "@/features/search/catalog-search";
import type { CatalogSearchIndex } from "@/features/search/search-types";

interface RelevanceScenario {
  mode: "projects" | "kits";
  query: string;
  top?: string[];
  required: string[];
  forbidden: string[];
  expectEmpty?: boolean;
}

const scenarios = scenariosJson as RelevanceScenario[];
let projectIndex: CatalogSearchIndex;

beforeAll(async () => {
  const catalog = await buildCatalog({ write: false });
  projectIndex = createCatalogSearchIndex(
    catalog.projects.map(({ id, search }) => ({ id, ...search })),
  );
});

describe("Project relevance corpus", () => {
  for (const scenario of scenarios.filter(({ mode }) => mode === "projects")) {
    test(scenario.query, () => {
      const resultIds = projectIndex
        .search(scenario.query)
        .matches.map(({ id }) => id);
      const diagnostic = `${scenario.query}: ${resultIds.join(", ")}`;

      expect(resultIds, diagnostic).toEqual(
        expect.arrayContaining(scenario.required),
      );
      if (scenario.forbidden.length > 0) {
        expect(resultIds, diagnostic).toEqual(
          expect.not.arrayContaining(scenario.forbidden),
        );
      }
      if (scenario.top) {
        expect(resultIds.slice(0, scenario.top.length), diagnostic).toEqual(
          scenario.top,
        );
      }
      if (scenario.expectEmpty) {
        expect(resultIds, diagnostic).toEqual([]);
      }
    });
  }
});
