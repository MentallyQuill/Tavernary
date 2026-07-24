import { describe, expect, test } from "vitest";

import {
  DEFAULT_QUERY,
  parseCatalogQuery,
  serializeCatalogQuery,
} from "@/features/catalog/catalog-query";
import { selectProjects } from "@/features/catalog/catalog-selectors";
import type { CatalogProject } from "@/features/catalog/catalog-types";

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
    summary: `${id} summary`,
    canonicalUrl: `https://example.com/${id}`,
    catalogedAt: "2026-07-01T00:00:00Z",
    catalogCohort: "standard",
    frontends: [
      { id: "sillytavern", label: "SillyTavern", description: "Frontend." },
    ],
    capabilities: [
      { id: "automation", label: "Automation", description: "Capability." },
    ],
    searchableText: `${id} extension automation`,
    activity: {
      latestSourceActivityAt: "2026-07-20T00:00:00Z",
      activeWeeks12: 4,
      weeklyActivity: [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
        true,
      ],
      evidenceStatus: "complete",
      dormant: false,
    },
    latestReleaseAt: null,
    community: { stars: 10, forks: 2, subscribers: 1, aggregate: 13 },
    repositorySizeKb: 100,
    license: {
      status: "osi-approved",
      label: "MIT",
      tooltip: "Open source",
    },
    preset: null,
    refreshedAt: "2026-07-23T00:00:00Z",
    staleSince: null,
    ...overrides,
  };
}

const multiFrontendProject = project("image-gen", {
  frontends: [
    { id: "sillytavern", label: "SillyTavern", description: "Frontend." },
    {
      id: "marinara-engine",
      label: "Marinara Engine",
      description: "Frontend.",
    },
  ],
  capabilities: [
    {
      id: "image-generation",
      label: "Image generation",
      description: "Capability.",
    },
  ],
});
const projects = [
  project("recursion", { name: "Recursion", searchableText: "recursion" }),
  multiFrontendProject,
  project("frontend", {
    kind: "frontend",
    primaryFunction: "frontend",
    capabilities: [
      {
        id: "extension-development",
        label: "Extensions",
        description: "Capability.",
      },
    ],
  }),
  project("dormant", {
    activity: {
      latestSourceActivityAt: "2026-01-01T00:00:00Z",
      activeWeeks12: 0,
      weeklyActivity: Array.from({ length: 12 }, () => false) as [
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
      ],
      evidenceStatus: "complete",
      dormant: true,
    },
  }),
  project("preset", {
    kind: "preset",
    catalogCohort: "seed",
    catalogedAt: "2026-07-23T00:00:00Z",
    activity: {
      latestSourceActivityAt: null,
      activeWeeks12: null,
      weeklyActivity: null,
      evidenceStatus: null,
      dormant: false,
    },
    latestReleaseAt: "2026-07-10T00:00:00Z",
    community: null,
    repositorySizeKb: null,
    license: {
      status: "missing",
      label: "Missing",
      tooltip: "Missing",
    },
    preset: {
      version: "1",
      publishedAt: "2026-07-10T00:00:00Z",
      artifactSizeBytes: null,
    },
  }),
];
const context = { now: "2026-07-23T00:00:00Z" };

describe("catalog selectors", () => {
  test("applies search, views, and multi-select group semantics", () => {
    expect(selectProjects(projects, DEFAULT_QUERY, context)).toHaveLength(5);
    expect(
      selectProjects(
        projects,
        { ...DEFAULT_QUERY, search: "recursion" },
        context,
      ),
    ).toHaveLength(1);
    expect(
      selectProjects(
        projects,
        {
          ...DEFAULT_QUERY,
          frontends: ["sillytavern", "marinara-engine"],
        },
        context,
      ),
    ).toContainEqual(multiFrontendProject);
    expect(
      selectProjects(
        projects,
        {
          ...DEFAULT_QUERY,
          kinds: ["frontend", "preset"],
          capabilities: ["automation", "extension-development"],
          category: "frontend",
        },
        context,
      ),
    ).toEqual([expect.objectContaining({ id: "frontend" })]);
    expect(
      selectProjects(projects, { ...DEFAULT_QUERY, view: "new" }, context),
    ).not.toContainEqual(expect.objectContaining({ catalogCohort: "seed" }));
    expect(
      selectProjects(projects, { ...DEFAULT_QUERY, view: "active" }, context),
    ).not.toContainEqual(expect.objectContaining({ id: "dormant" }));
    expect(
      selectProjects(projects, { ...DEFAULT_QUERY, view: "released" }, context),
    ).toContainEqual(expect.objectContaining({ id: "preset" }));
  });

  test("sorts by recent activity, sustained activity, popularity, and name", () => {
    const sortable = [
      project("weak", {
        name: "Zulu",
        catalogedAt: "2026-07-02T00:00:00Z",
        activity: {
          ...project("base").activity,
          latestSourceActivityAt: "2026-07-21T00:00:00Z",
          activeWeeks12: 1,
        },
        community: { stars: 1, forks: 0, subscribers: 0, aggregate: 1 },
      }),
      project("strong", {
        name: "alpha",
        activity: {
          ...project("base").activity,
          latestSourceActivityAt: "2026-07-19T00:00:00Z",
          activeWeeks12: 6,
        },
        community: { stars: 20, forks: 0, subscribers: 0, aggregate: 20 },
      }),
      project("manual", {
        name: "Beta",
        kind: "preset",
        catalogedAt: "2026-07-03T00:00:00Z",
        activity: {
          latestSourceActivityAt: null,
          activeWeeks12: null,
          weeklyActivity: null,
          evidenceStatus: null,
          dormant: false,
        },
        community: null,
      }),
    ];

    expect(
      selectProjects(
        sortable,
        { ...DEFAULT_QUERY, sort: "recent" },
        context,
      ).map(({ id }) => id),
    ).toEqual(["weak", "strong", "manual"]);
    expect(
      selectProjects(
        sortable,
        { ...DEFAULT_QUERY, sort: "sustained" },
        context,
      ).map(({ id }) => id),
    ).toEqual(["strong", "weak", "manual"]);
    expect(
      selectProjects(
        sortable,
        { ...DEFAULT_QUERY, sort: "popularity" },
        context,
      ).map(({ id }) => id),
    ).toEqual(["strong", "weak", "manual"]);
    expect(
      selectProjects(
        sortable,
        { ...DEFAULT_QUERY, sort: "alphabetical" },
        context,
      ).map(({ id }) => id),
    ).toEqual(["strong", "manual", "weak"]);
  });

  test("recent activity uses the newer source or release timestamp", () => {
    const sortable = [
      project("released", {
        activity: {
          latestSourceActivityAt: "2026-07-01T00:00:00Z",
          activeWeeks12: 1,
          weeklyActivity: [
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            true,
          ],
          evidenceStatus: "complete",
          dormant: false,
        } as never,
        latestReleaseAt: "2026-07-22T00:00:00Z",
      }),
      project("source", {
        activity: {
          latestSourceActivityAt: "2026-07-20T00:00:00Z",
          activeWeeks12: 2,
          weeklyActivity: [
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            true,
            true,
          ],
          evidenceStatus: "complete",
          dormant: false,
        } as never,
      }),
    ];

    expect(
      selectProjects(
        sortable,
        { ...DEFAULT_QUERY, sort: "recent" },
        context,
      ).map(({ id }) => id),
    ).toEqual(["released", "source"]);
    expect(
      selectProjects(
        sortable,
        { ...DEFAULT_QUERY, sort: "sustained" } as never,
        context,
      ).map(({ id }) => id),
    ).toEqual(["source", "released"]);
  });

  test("orders unscored activity ties by catalog date and then name", () => {
    const unscored = [
      project("older", {
        name: "Zulu",
        catalogedAt: "2026-07-01T00:00:00Z",
        activity: {
          latestSourceActivityAt: null,
          activeWeeks12: null,
          weeklyActivity: null,
          evidenceStatus: null,
          dormant: false,
        },
      }),
      project("alpha", {
        name: "Alpha",
        catalogedAt: "2026-07-02T00:00:00Z",
        activity: {
          latestSourceActivityAt: null,
          activeWeeks12: null,
          weeklyActivity: null,
          evidenceStatus: null,
          dormant: false,
        },
      }),
      project("beta", {
        name: "Beta",
        catalogedAt: "2026-07-02T00:00:00Z",
        activity: {
          latestSourceActivityAt: null,
          activeWeeks12: null,
          weeklyActivity: null,
          evidenceStatus: null,
          dormant: false,
        },
      }),
    ];

    expect(
      selectProjects(unscored, DEFAULT_QUERY, context).map(({ id }) => id),
    ).toEqual(["alpha", "beta", "older"]);
  });

  test("applies development and license groups", () => {
    const pendingProject = project("pending", {
      license: {
        status: "pending",
        label: "Pending review",
        tooltip: "License review is pending for this source.",
      },
    });

    expect(
      selectProjects(
        projects,
        { ...DEFAULT_QUERY, development: ["dormant"] },
        context,
      ).map(({ id }) => id),
    ).toEqual(["dormant"]);
    expect(
      selectProjects(
        [...projects, pendingProject],
        { ...DEFAULT_QUERY, licenses: ["pending"] },
        context,
      ).map(({ id }) => id),
    ).toEqual(["pending"]);
    expect(
      selectProjects(
        [...projects, pendingProject],
        { ...DEFAULT_QUERY, licenses: ["missing"] },
        context,
      ).map(({ id }) => id),
    ).toEqual(["preset"]);
  });

  test("treats System Presets as a primary category", () => {
    expect(
      selectProjects(
        projects,
        { ...DEFAULT_QUERY, category: "preset" },
        context,
      ).map(({ id }) => id),
    ).toEqual(["preset"]);
  });

  test("keeps uncategorized results visible with deterministic alphabetical ties", () => {
    const uncategorizedProjects = [
      project("zeta", {
        name: "Shared Name",
        primaryFunction: "uncategorized",
      }),
      project("alpha", {
        name: "Shared Name",
        primaryFunction: "uncategorized",
      }),
      project("beta", {
        name: "Another Name",
        primaryFunction: "uncategorized",
      }),
    ];

    expect(
      selectProjects(
        uncategorizedProjects,
        { ...DEFAULT_QUERY, category: "uncategorized", sort: "alphabetical" },
        context,
      ).map(({ id }) => id),
    ).toEqual(["beta", "alpha", "zeta"]);
  });
});

describe("catalog query URLs", () => {
  test("round-trips valid non-default values in stable order", () => {
    const serialized = serializeCatalogQuery({
      ...DEFAULT_QUERY,
      search: "memory",
      sort: "sustained",
      frontends: ["sillytavern", "marinara-engine"],
      kinds: ["preset", "extension"],
    });
    expect(serialized).toBe(
      "q=memory&sort=sustained&frontend=marinara-engine&frontend=sillytavern&kind=extension&kind=preset",
    );
    expect(parseCatalogQuery(`?${serialized}`)).toEqual({
      ...DEFAULT_QUERY,
      search: "memory",
      sort: "sustained",
      frontends: ["marinara-engine", "sillytavern"],
      kinds: ["extension", "preset"],
    });
  });

  test("discards invalid URL values", () => {
    expect(
      parseCatalogQuery(
        "?view=broken&sort=nope&density=huge&kind=port&frontend=unknown&license=free",
      ),
    ).toEqual(DEFAULT_QUERY);
  });

  test("accepts uncategorized as a valid category", () => {
    expect(parseCatalogQuery("?category=uncategorized")).toEqual({
      ...DEFAULT_QUERY,
      category: "uncategorized",
    });
    expect(
      serializeCatalogQuery({
        ...DEFAULT_QUERY,
        category: "uncategorized",
      }),
    ).toBe("category=uncategorized");
  });

  test("round-trips pending license query state", () => {
    expect(
      serializeCatalogQuery({
        ...DEFAULT_QUERY,
        licenses: ["pending"],
      }),
    ).toBe("license=pending");

    expect(parseCatalogQuery("?license=pending")).toEqual({
      ...DEFAULT_QUERY,
      licenses: ["pending"],
    });
  });
});
