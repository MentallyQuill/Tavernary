import { describe, expect, test } from "vitest";

import { DEFAULT_KIT_QUERY } from "@/features/kits/kit-query";
import { countKitsForFilter, selectKits } from "@/features/kits/kit-selectors";
import type { CatalogKit } from "@/features/kits/kit-types";
import type { CatalogProject } from "@/features/catalog/catalog-types";

const label = (id: string) => ({ id, label: id, description: id });

function project(
  id: string,
  overrides: Partial<CatalogProject> = {},
): CatalogProject {
  return {
    id,
    name: id,
    kind: "extension",
    metadataStatus: "curated",
    sourceStatus: "healthy",
    primaryFunction: "generation-reasoning",
    summary: id,
    canonicalUrl: `https://example.com/${id}`,
    catalogedAt: "2026-07-01T00:00:00.000Z",
    catalogCohort: "standard",
    frontends: [label("sillytavern")],
    capabilities: [],
    searchableText: id,
    attribution: null,
    activity: {
      latestSourceActivityAt: "2026-07-20T00:00:00.000Z",
      activeWeeks12: 1,
      weeklyActivity: null,
      evidenceStatus: "complete",
      dormant: false,
    },
    latestReleaseAt: null,
    community: null,
    repositorySizeKb: null,
    license: {
      status: "osi-approved",
      label: "MIT",
      tooltip: "MIT",
    },
    preset: null,
    refreshedAt: "2026-07-24T00:00:00.000Z",
    staleSince: null,
    ...overrides,
  };
}

function kit(id: string, overrides: Partial<CatalogKit> = {}): CatalogKit {
  return {
    id,
    title: id,
    description: `${id} description`,
    author: { githubUserId: 1, login: `${id}-author` },
    sourceIssueNumber: 1,
    publishedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    tavernaryPick: false,
    frontends: [label("sillytavern")],
    purposes: [label("generation-reasoning")],
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
    searchableText: `${id} ${id}-author frontend generation-reasoning`,
    ...overrides,
  };
}

const multiFrontendMemoryKit = kit("memory", {
  title: "Shared",
  frontends: [label("sillytavern"), label("lumiverse")],
  purposes: [label("memory-retrieval")],
  tavernaryPick: true,
  publishedAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
  trendingScore: 5,
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

  test("applies inclusive size and Pick filters", () => {
    expect(
      selectKits(kits, {
        ...DEFAULT_KIT_QUERY,
        minProjects: 3,
        maxProjects: 3,
        tavernaryPickOnly: true,
      }),
    ).toEqual([multiFrontendMemoryKit]);
  });

  test("filters Kit creators by durable GitHub user ID", () => {
    expect(
      selectKits(kits, {
        ...DEFAULT_KIT_QUERY,
        creatorIds: [multiFrontendMemoryKit.author.githubUserId],
      }),
    ).toContain(multiFrontendMemoryKit);
    expect(
      selectKits(kits, {
        ...DEFAULT_KIT_QUERY,
        creatorIds: [999],
      }),
    ).toEqual([]);
  });

  test("matches a Kit containing any selected non-Frontend project kind", () => {
    const presetKit = kit("preset-kit", {
      components: [
        ...kit("preset-kit").components.slice(0, 2),
        {
          ...kit("preset-kit").components[2],
          kind: "preset",
        },
      ],
    });

    expect(
      selectKits([multiFrontendMemoryKit, presetKit], {
        ...DEFAULT_KIT_QUERY,
        kinds: ["preset"],
      }),
    ).toEqual([presetKit]);
  });

  test("matches a Kit containing a selected component capability", () => {
    const routingKit = kit("routing", {
      components: kit("routing").components.map((component, index) =>
        index === 1
          ? {
              ...component,
              project: project(component.projectId, {
                capabilities: [label("model-routing")],
              }),
            }
          : component,
      ),
    });

    expect(
      selectKits([multiFrontendMemoryKit, routingKit], {
        ...DEFAULT_KIT_QUERY,
        capabilities: ["model-routing"],
      }),
    ).toEqual([routingKit]);
  });

  test("matches a Kit with any component active this month", () => {
    const activeKit = kit("active", {
      components: kit("active").components.map((component, index) =>
        index === 1
          ? {
              ...component,
              project: project(component.projectId, {
                activity: {
                  ...project(component.projectId).activity,
                  latestSourceActivityAt: "2026-07-20T00:00:00.000Z",
                },
              }),
            }
          : component,
      ),
    });

    expect(
      selectKits(
        [multiFrontendMemoryKit, activeKit],
        { ...DEFAULT_KIT_QUERY, development: ["active-month"] },
        "",
        "2026-07-25T00:00:00.000Z",
      ),
    ).toEqual([activeKit]);
  });

  test("matches a Kit with any component released this month", () => {
    const releasedKit = kit("released", {
      components: kit("released").components.map((component, index) =>
        index === 2
          ? {
              ...component,
              project: project(component.projectId, {
                latestReleaseAt: "2026-07-22T00:00:00.000Z",
              }),
            }
          : component,
      ),
    });

    expect(
      selectKits(
        [multiFrontendMemoryKit, releasedKit],
        { ...DEFAULT_KIT_QUERY, development: ["new-release"] },
        "",
        "2026-07-25T00:00:00.000Z",
      ),
    ).toEqual([releasedKit]);
  });

  test("matches a Kit with any dormant component", () => {
    const dormantKit = kit("dormant", {
      components: kit("dormant").components.map((component, index) =>
        index === 1
          ? {
              ...component,
              project: project(component.projectId, {
                activity: {
                  ...project(component.projectId).activity,
                  dormant: true,
                },
              }),
            }
          : component,
      ),
    });

    expect(
      selectKits([multiFrontendMemoryKit, dormantKit], {
        ...DEFAULT_KIT_QUERY,
        development: ["dormant"],
      }),
    ).toEqual([dormantKit]);
  });

  test("maps component license statuses to Kit license filters", () => {
    const cases = [
      ["osi-approved", "open-source"],
      ["proprietary", "proprietary"],
      ["pending", "pending"],
      ["missing", "missing"],
    ] as const;

    for (const [status, filter] of cases) {
      const matchingKit = kit(status, {
        components: kit(status).components.map((component, index) =>
          index === 1
            ? {
                ...component,
                project: project(component.projectId, {
                  license: {
                    status,
                    label: status,
                    tooltip: status,
                  },
                }),
              }
            : component,
        ),
      });
      expect(
        selectKits([multiFrontendMemoryKit, matchingKit], {
          ...DEFAULT_KIT_QUERY,
          licenses: [filter],
        }),
      ).toEqual([matchingKit]);
    }
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
