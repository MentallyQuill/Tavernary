import { performance } from "node:perf_hooks";

import { expect, test } from "vitest";

import { buildCatalog } from "../../scripts/catalog/build.mjs";
import scenariosJson from "../fixtures/catalog-search-relevance.json";
import { createCatalogSearchIndex } from "@/features/search/catalog-search";
import type {
  CatalogSearchDocument,
  CatalogSearchIndex,
} from "@/features/search/search-types";

interface RelevanceScenario {
  mode: "projects" | "kits";
  query: string;
  top?: string[];
  required: string[];
  forbidden: string[];
  expectEmpty?: boolean;
}

const scenarios = scenariosJson as RelevanceScenario[];
const repetitions = 100;

function buildTimedIndex(documents: CatalogSearchDocument[]) {
  const startedAt = performance.now();
  const index = createCatalogSearchIndex(documents);
  return {
    index,
    durationMs: performance.now() - startedAt,
  };
}

function assertScenario(
  scenario: RelevanceScenario,
  index: CatalogSearchIndex,
) {
  const resultIds = index.search(scenario.query).matches.map(({ id }) => id);
  const diagnostic = `${scenario.mode} "${scenario.query}": ${resultIds.join(", ")}`;

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
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function milliseconds(value: number) {
  return Number(value.toFixed(3));
}

test("reports generated-catalog search measurements", async () => {
  const catalog = await buildCatalog({ write: false });
  const projectDocuments = catalog.projects.map(({ id, search }) => ({
    id,
    ...search,
  }));
  const kitDocuments = catalog.kits.map(({ id, search }) => ({
    id,
    ...search,
  }));
  const projectMeasurement = buildTimedIndex(projectDocuments);
  const kitMeasurement = buildTimedIndex(kitDocuments);
  const indexes = {
    projects: projectMeasurement.index,
    kits: kitMeasurement.index,
  } as const;

  for (const scenario of scenarios) {
    assertScenario(scenario, indexes[scenario.mode]);
  }

  const queryDurations: number[] = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (const scenario of scenarios) {
      const startedAt = performance.now();
      indexes[scenario.mode].search(scenario.query);
      queryDurations.push(performance.now() - startedAt);
    }
  }

  const measurements = [
    projectMeasurement.durationMs,
    kitMeasurement.durationMs,
    ...queryDurations,
  ];
  expect(measurements.every(Number.isFinite)).toBe(true);

  const searchPayloadBytes = Buffer.byteLength(
    JSON.stringify({
      projects: projectDocuments,
      kits: kitDocuments,
    }),
    "utf8",
  );
  const metrics = {
    projects: catalog.projects.length,
    kits: catalog.kits.length,
    projectIndexMs: milliseconds(projectMeasurement.durationMs),
    kitIndexMs: milliseconds(kitMeasurement.durationMs),
    medianQueryMs: milliseconds(median(queryDurations)),
    maxQueryMs: milliseconds(Math.max(...queryDurations)),
    searchPayloadBytes,
  };

  expect(Number.isFinite(searchPayloadBytes)).toBe(true);
  console.info(JSON.stringify(metrics, null, 2));
});
