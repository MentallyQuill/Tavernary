import { describe, expect, test } from "vitest";

import { DEFAULT_KIT_QUERY } from "@/features/kits/kit-query";
import { countKitsForFilter, selectKits } from "@/features/kits/kit-selectors";
import type { CatalogKit } from "@/features/kits/kit-types";
import type { CatalogSearchResults } from "@/features/search/search-types";
import { catalogSearchFields } from "../helpers/catalog-search-fields";

const label = (id: string) => ({ id, label: id, description: id });

function kit(id: string, overrides: Partial<CatalogKit> = {}): CatalogKit {
  return {
    id,
    title: id,
    description: `${id} description`,
    author: { githubUserId: 1, login: `${id}-author` },
    sourceIssueNumber: 1,
    sourceIssueUrl: `https://github.com/fixture/catalog/issues/${id}`,
    publishedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    frontends: [label("sillytavern")],
    purposes: [label("generation-reasoning")],
    modelFamilies: [],
    components: [
      {
        projectId: `${id}-frontend`,
        name: "Frontend",
        kind: "frontend",
        primaryFunction: "frontend",
        availability: "available",
        unavailableReason: null,
        canonicalUrl: "https://example.com/frontend",
        project: null,
      },
      ...["one", "two"].map((suffix) => ({
        projectId: `${id}-${suffix}`,
        name: suffix,
        kind: "extension" as const,
        primaryFunction: "generation-reasoning",
        availability: "available" as const,
        unavailableReason: null,
        canonicalUrl: `https://example.com/${suffix}`,
        project: null,
      })),
    ],
    supporterCount: 1,
    trendingScore: 1,
    supportRefreshedAt: "2026-07-24T00:00:00.000Z",
    supportStale: false,
    flaggedProjectCount: 0,
    search: catalogSearchFields(id),
    searchableText: `${id} ${id}-author frontend generation-reasoning`,
    ...overrides,
  };
}

const multiFrontendMemoryKit = kit("memory", {
  title: "Shared",
  frontends: [label("sillytavern"), label("lumiverse")],
  purposes: [label("memory-retrieval")],
  publishedAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
  trendingScore: 5,
  search: catalogSearchFields("Shared", {
    aliases: ["memory-project"],
    summary: ["durable memory"],
    primaryFunction: ["memory-retrieval"],
    frontends: ["sillytavern", "lumiverse"],
    maintainers: ["memory-author"],
  }),
  searchableText:
    "shared durable memory memory-author memory-project sillytavern lumiverse memory-retrieval",
});
const alphabeticalTie = kit("alpha-id", {
  title: "Shared",
  publishedAt: "2026-07-20T00:00:00.000Z",
  trendingScore: 5,
});
const unavailable = kit("unavailable", {
  publishedAt: "2026-07-24T00:00:00.000Z",
  trendingScore: null,
});
const kits = [unavailable, alphabeticalTie, multiFrontendMemoryKit];

describe("Kit selectors", () => {
  test("uses structured all-term results as search eligibility before filters", () => {
    const exactKit = kit("exact", {
      title: "Super Awesome Test Kit",
      search: catalogSearchFields("Super Awesome Test Kit"),
      searchableText: "",
    });
    const secondaryKit = kit("secondary", {
      title: "Secondary Kit",
      search: catalogSearchFields("Secondary Kit", {
        summary: ["A super awesome collection."],
      }),
      searchableText: "",
    });
    const searchResults: CatalogSearchResults = {
      normalizedQuery: "super awesome",
      correction: null,
      degraded: false,
      matches: [
        { id: exactKit.id, score: 40, evidence: [] },
        { id: secondaryKit.id, score: 5, evidence: [] },
      ],
    };

    expect(
      selectKits(
        [secondaryKit, exactKit],
        DEFAULT_KIT_QUERY,
        "super awesome",
        searchResults,
      ).map(({ id }) => id),
    ).toEqual(expect.arrayContaining([exactKit.id, secondaryKit.id]));
  });

  test("uses OR within groups and AND across groups", () => {
    expect(
      selectKits(kits, {
        ...DEFAULT_KIT_QUERY,
        frontends: ["sillytavern", "lumiverse"],
        purposes: ["memory-retrieval"],
      }),
    ).toEqual([multiFrontendMemoryKit]);
  });

  test("searches all indexed Kit fields and exact component IDs", () => {
    for (const search of [
      "durable",
      "memory-author",
      "memory-project",
      "lumiverse",
      "memory-retrieval",
    ]) {
      expect(selectKits(kits, DEFAULT_KIT_QUERY, search)).toEqual([
        multiFrontendMemoryKit,
      ]);
    }
    expect(
      selectKits(kits, {
        ...DEFAULT_KIT_QUERY,
        includesProjectId: "memory-one",
      }),
    ).toEqual([multiFrontendMemoryKit]);
  });

  test("applies inclusive size filters", () => {
    expect(
      selectKits(kits, {
        ...DEFAULT_KIT_QUERY,
        minProjects: 3,
        maxProjects: 3,
      }).map(({ id }) => id),
    ).toEqual(["alpha-id", "memory", "unavailable"]);
  });

  test("filters to Kits whose components are all available", () => {
    const flaggedKit = kit("flagged", { flaggedProjectCount: 1 });

    expect(
      selectKits([flaggedKit, multiFrontendMemoryKit], {
        ...DEFAULT_KIT_QUERY,
        allComponentsAvailable: true,
      }),
    ).toEqual([multiFrontendMemoryKit]);
  });

  test("counts a facet option after applying filters outside its group", () => {
    expect(
      countKitsForFilter(
        kits,
        {
          ...DEFAULT_KIT_QUERY,
          frontends: ["lumiverse"],
          purposes: ["generation-reasoning"],
        },
        "purposes",
        "memory-retrieval",
      ),
    ).toBe(1);
  });

  test("filters and counts Kits by explicit model recommendation tags", () => {
    const agnostic = kit("agnostic", {
      modelFamilies: [label("model-agnostic")],
    });
    const recommended = kit("recommended", {
      modelFamilies: [label("model-agnostic"), label("claude")],
    });
    const modelKits = [agnostic, recommended];

    expect(
      selectKits(modelKits, {
        ...DEFAULT_KIT_QUERY,
        modelFamilies: ["claude"],
      }).map(({ id }) => id),
    ).toEqual(["recommended"]);
    expect(
      countKitsForFilter(
        modelKits,
        DEFAULT_KIT_QUERY,
        "modelFamilies",
        "claude",
      ),
    ).toBe(1);
    expect(
      countKitsForFilter(
        modelKits,
        DEFAULT_KIT_QUERY,
        "modelFamilies",
        "model-agnostic",
      ),
    ).toBe(2);
  });

  test("sorts Trending nulls last with published, title, and ID tie-breaks", () => {
    expect(selectKits(kits, DEFAULT_KIT_QUERY).map(({ id }) => id)).toEqual([
      "alpha-id",
      "memory",
      "unavailable",
    ]);
  });

  test("sorts newest, updated, and alphabetical deterministically", () => {
    expect(
      selectKits(kits, { ...DEFAULT_KIT_QUERY, sort: "newest" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["unavailable", "alpha-id", "memory"]);
    expect(
      selectKits(kits, { ...DEFAULT_KIT_QUERY, sort: "updated" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["memory", "alpha-id", "unavailable"]);
    expect(
      selectKits(kits, { ...DEFAULT_KIT_QUERY, sort: "alphabetical" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["alpha-id", "memory", "unavailable"]);
  });
});
