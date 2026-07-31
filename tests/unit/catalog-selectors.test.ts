import { describe, expect, test } from "vitest";

import frontendVocabulary from "../../data/vocabularies/frontends.json";
import tagVocabulary from "../../data/vocabularies/tags.json";
import {
  CATEGORY_OPTIONS,
  DEFAULT_QUERY,
  parseCatalogQuery,
  serializeCatalogQuery,
} from "@/features/catalog/catalog-query";
import {
  selectForkRelationship,
  selectProjects,
} from "@/features/catalog/catalog-selectors";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { CatalogSearchResults } from "@/features/search/search-types";
import { catalogSearchFields } from "../helpers/catalog-search-fields";

const label = (id: string) => ({ id, label: id, description: id });
const publicTagVocabulary = tagVocabulary.tags.map(
  ({ id, label, facet, description, aliases, applicable_kinds }) => ({
    id,
    label,
    facet: facet as "goal" | "trait",
    description,
    aliases,
    applicable_kinds: applicable_kinds as Array<
      "frontend" | "extension" | "preset"
    >,
  }),
);

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
    tags: [
      {
        id: "automate-roleplay-workflows",
        label: "Automate roleplay workflows",
        description: "Goal.",
        facet: "goal",
      },
    ],
    search: catalogSearchFields(id),
    searchableText: `${id} extension automation`,
    fork: null,
    attribution: null,
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
    community: { stars: 10, forks: 2, watchers: 1, aggregate: 13 },
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
  tags: [
    {
      id: "generate-images",
      label: "Generate images",
      description: "Goal.",
      facet: "goal",
    },
  ],
});
const projects = [
  project("recursion", { name: "Recursion", searchableText: "recursion" }),
  multiFrontendProject,
  project("frontend", {
    kind: "frontend",
    primaryFunction: "frontend",
    tags: [
      {
        id: "build-extensions-and-scripts",
        label: "Build extensions and scripts",
        description: "Goal.",
        facet: "goal",
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
      modelFamilies: [],
      completionFormats: [],
    },
  }),
];
const agnosticPreset = project("agnostic-preset", {
  kind: "preset",
  preset: {
    version: null,
    publishedAt: null,
    artifactSizeBytes: null,
    modelFamilies: [label("model-agnostic")],
    completionFormats: [label("chat-completion")],
  },
});
const recommendedPreset = project("recommended-preset", {
  kind: "preset",
  preset: {
    version: null,
    publishedAt: null,
    artifactSizeBytes: null,
    modelFamilies: [label("model-agnostic"), label("claude")],
    completionFormats: [label("chat-completion")],
  },
});
const context = { now: "2026-07-23T00:00:00Z" };

describe("catalog selectors", () => {
  test("uses Tavernary scores only for Relevance and deterministic activity ties", () => {
    const highScore = project("alpha", { name: "Alpha" });
    const recentlyUpdated = project("zeta", {
      name: "Zeta",
      latestReleaseAt: "2026-07-24T00:00:00Z",
    });
    const scoredResults: CatalogSearchResults = {
      normalizedQuery: "shared",
      correction: null,
      degraded: false,
      matches: [
        { id: highScore.id, score: 40, evidence: [] },
        { id: recentlyUpdated.id, score: 5, evidence: [] },
      ],
    };

    expect(
      selectProjects(
        [recentlyUpdated, highScore],
        { ...DEFAULT_QUERY, search: "shared", sort: "relevance" },
        context,
        scoredResults,
      ).map(({ id }) => id),
    ).toEqual(["alpha", "zeta"]);
    expect(
      selectProjects(
        [recentlyUpdated, highScore],
        { ...DEFAULT_QUERY, search: "shared", sort: "alphabetical" },
        context,
        scoredResults,
      ).map(({ id }) => id),
    ).toEqual(["alpha", "zeta"]);

    const tiedResults = {
      ...scoredResults,
      matches: scoredResults.matches.map((match) => ({
        ...match,
        score: 10,
      })),
    };
    expect(
      selectProjects(
        [highScore, recentlyUpdated],
        { ...DEFAULT_QUERY, search: "shared", sort: "relevance" },
        context,
        tiedResults,
      ).map(({ id }) => id),
    ).toEqual(["zeta", "alpha"]);
  });

  test("uses structured all-term results as search eligibility before filters", () => {
    const freaky = project("freaky", {
      kind: "preset",
      name: "Preset Introducing Freaky Frankenstein 50",
      search: catalogSearchFields("Preset Introducing Freaky Frankenstein 50"),
      searchableText: "",
    });
    const supporting = project("supporting", {
      search: catalogSearchFields("Supporting Project", {
        summary: ["Preset support for Freaky Frankenstein."],
      }),
      searchableText: "",
    });
    const unrelated = project("unrelated", {
      searchableText: "preset freaky",
    });
    const searchResults: CatalogSearchResults = {
      normalizedQuery: "preset freaky",
      correction: null,
      degraded: false,
      matches: [
        { id: freaky.id, score: 50, evidence: [] },
        { id: supporting.id, score: 10, evidence: [] },
      ],
    };

    expect(
      selectProjects(
        [unrelated, supporting, freaky],
        { ...DEFAULT_QUERY, search: "preset freaky" },
        context,
        searchResults,
      )
        .map(({ id }) => id)
        .sort(),
    ).toEqual(["freaky", "supporting"]);
    expect(
      selectProjects(
        [unrelated, supporting, freaky],
        {
          ...DEFAULT_QUERY,
          search: "preset freaky",
          kinds: ["preset"],
        },
        context,
        searchResults,
      ).map(({ id }) => id),
    ).toEqual(["freaky"]);
  });

  test("selects only the immediate published parent and child in relationship order", () => {
    const grandparent = project("grandparent", { name: "Grandparent" });
    const parent = project("parent", {
      name: "Parent",
      fork: {
        parentName: "Grandparent",
        parentProjectId: "grandparent",
        parentUrl: null,
        status: "published",
      },
    });
    const child = project("child", {
      name: "Child",
      fork: {
        parentName: "Parent",
        parentProjectId: "parent",
        parentUrl: null,
        status: "published",
      },
    });

    expect(
      selectForkRelationship([child, grandparent, parent], "child"),
    ).toEqual([parent, child]);
    expect(
      selectForkRelationship([child, grandparent, parent], "parent"),
    ).toEqual([grandparent, parent]);
  });

  test("relationship selection ignores ordinary filters and rejects broken links", () => {
    const parent = project("parent", { searchableText: "upstream" });
    const child = project("child", {
      searchableText: "downstream",
      fork: {
        parentName: "Parent",
        parentProjectId: "parent",
        parentUrl: null,
        status: "published",
      },
    });

    expect(selectForkRelationship([child, parent], "child")).toEqual([
      parent,
      child,
    ]);
    expect(selectForkRelationship([parent], "child")).toBeNull();
    expect(
      selectForkRelationship(
        [
          parent,
          {
            ...child,
            fork: { ...child.fork!, status: "not-listed" },
          },
        ],
        "child",
      ),
    ).toBeNull();
    expect(
      selectForkRelationship(
        [
          {
            ...child,
            fork: { ...child.fork!, parentProjectId: "missing" },
          },
          parent,
        ],
        "child",
      ),
    ).toBeNull();
    expect(
      selectForkRelationship(
        [
          {
            ...child,
            fork: { ...child.fork!, parentProjectId: "child" },
          },
        ],
        "child",
      ),
    ).toBeNull();
  });

  test("matches repository owners, human contributors, and bot contributors", () => {
    const attributed = project("directive", {
      search: catalogSearchFields("directive", {
        maintainers: ["MentallyQuill", "alice", "claude", "dependabot[bot]"],
      }),
      searchableText: "directive mentallyquill alice claude dependabot[bot]",
      attribution: {
        owner: { provider: "github", login: "MentallyQuill" },
        contributors: [
          { provider: "github", login: "alice", botOrAi: false },
          { provider: "github", login: "claude", botOrAi: true },
          {
            provider: "github",
            login: "dependabot[bot]",
            botOrAi: true,
          },
        ],
        humanContributorCount: 1,
        status: "current",
      },
    });

    for (const search of [
      "mentallyquill",
      "alice",
      "claude",
      "dependabot[bot]",
    ]) {
      expect(
        selectProjects([attributed], { ...DEFAULT_QUERY, search }, context),
      ).toEqual([attributed]);
    }
  });

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
          tags: ["automate-roleplay-workflows", "build-extensions-and-scripts"],
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
        community: { stars: 1, forks: 0, watchers: 0, aggregate: 1 },
      }),
      project("strong", {
        name: "alpha",
        activity: {
          ...project("base").activity,
          latestSourceActivityAt: "2026-07-19T00:00:00Z",
          activeWeeks12: 6,
        },
        community: { stars: 20, forks: 0, watchers: 0, aggregate: 20 },
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

  test("filters Presets by explicit model recommendation tags", () => {
    expect(
      selectProjects(
        [agnosticPreset, recommendedPreset],
        { ...DEFAULT_QUERY, modelFamilies: ["claude"] },
        context,
      ).map(({ id }) => id),
    ).toEqual(["recommended-preset"]);

    expect(
      selectProjects(
        [agnosticPreset, recommendedPreset],
        { ...DEFAULT_QUERY, modelFamilies: ["model-agnostic"] },
        context,
      ).map(({ id }) => id),
    ).toEqual(["agnostic-preset", "recommended-preset"]);
  });

  test("filters Frontends structurally instead of trusting an Extension label", () => {
    const frontendProjects = [
      project("zeta", {
        name: "Shared Name",
        kind: "frontend",
        primaryFunction: "frontend",
      }),
      project("alpha", {
        name: "Shared Name",
        kind: "frontend",
        primaryFunction: "frontend",
      }),
      project("beta", {
        name: "Another Name",
        kind: "extension",
        primaryFunction: "frontend",
      }),
    ];

    expect(
      selectProjects(
        frontendProjects,
        { ...DEFAULT_QUERY, category: "frontend", sort: "alphabetical" },
        context,
      ).map(({ id }) => id),
    ).toEqual(["alpha", "zeta"]);
  });
});

describe("catalog query URLs", () => {
  test("makes Relevance conditional on a meaningful search", () => {
    expect(parseCatalogQuery("?q=preset+freaky").sort).toBe("relevance");
    expect(parseCatalogQuery("?q=preset+freaky&sort=popularity").sort).toBe(
      "popularity",
    );
    expect(parseCatalogQuery("?sort=relevance").sort).toBe("recent");
    expect(parseCatalogQuery("?q=---").sort).toBe("recent");
  });

  test("omits implicit Relevance but serializes an explicit browse override", () => {
    expect(
      serializeCatalogQuery({
        ...DEFAULT_QUERY,
        search: "preset freaky",
        sort: "relevance",
      }),
    ).toBe("q=preset+freaky");
    expect(
      serializeCatalogQuery({
        ...DEFAULT_QUERY,
        search: "preset freaky",
        sort: "popularity",
      }),
    ).toBe("q=preset+freaky&sort=popularity");
  });

  test("round-trips canonical tags and maps only exact legacy capability aliases", () => {
    const serialized = serializeCatalogQuery({
      ...DEFAULT_QUERY,
      tags: ["local-first", "automate-roleplay-workflows"],
    });

    expect(serialized).toBe("tag=automate-roleplay-workflows&tag=local-first");
    expect(
      parseCatalogQuery(`?${serialized}`, publicTagVocabulary).tags,
    ).toEqual(["automate-roleplay-workflows", "local-first"]);
    expect(
      parseCatalogQuery(
        "?capability=automation&capability=multi-frontend",
        publicTagVocabulary,
      ).tags,
    ).toEqual(["automate-roleplay-workflows"]);
  });

  test("round-trips every frontend exposed by the filter vocabulary", () => {
    for (const { id } of frontendVocabulary.frontends) {
      const serialized = serializeCatalogQuery({
        ...DEFAULT_QUERY,
        frontends: [id],
      });

      expect(parseCatalogQuery(`?${serialized}`).frontends).toEqual([id]);
    }
  });

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
      kits: {
        ...DEFAULT_QUERY.kits,
        sort: "relevance",
      },
      frontends: ["marinara-engine", "sillytavern"],
      kinds: ["extension", "preset"],
    });
  });

  test("round-trips relationship scope alongside ordinary project filters", () => {
    const serialized = serializeCatalogQuery({
      ...DEFAULT_QUERY,
      search: "memory",
      sort: "relevance",
      frontends: ["sillytavern"],
      relationship: "vectfox",
    });

    expect(serialized).toBe(
      "q=memory&relationship=vectfox&frontend=sillytavern",
    );
    expect(parseCatalogQuery(`?${serialized}`)).toEqual({
      ...DEFAULT_QUERY,
      search: "memory",
      sort: "relevance",
      kits: {
        ...DEFAULT_QUERY.kits,
        sort: "relevance",
      },
      frontends: ["sillytavern"],
      relationship: "vectfox",
    });
  });

  test("normalizes invalid relationship IDs and discards them in Kit mode", () => {
    for (const relationship of ["", " ", "Unsafe_ID", "../parent"]) {
      expect(
        parseCatalogQuery(`?relationship=${encodeURIComponent(relationship)}`)
          .relationship,
      ).toBe("");
      expect(
        serializeCatalogQuery({ ...DEFAULT_QUERY, relationship }),
      ).not.toContain("relationship=");
    }

    expect(
      parseCatalogQuery("?mode=kits&relationship=child").relationship,
    ).toBe("");
    expect(
      serializeCatalogQuery({
        ...DEFAULT_QUERY,
        mode: "kits",
        relationship: "child",
      }),
    ).not.toContain("relationship=");
  });

  test("discards invalid URL values", () => {
    expect(
      parseCatalogQuery(
        "?view=broken&sort=nope&density=huge&kind=port&frontend=unknown&license=free",
      ),
    ).toEqual(DEFAULT_QUERY);
  });

  test("discards the removed Uncategorized category from stale and generated URLs", () => {
    expect(parseCatalogQuery("?category=uncategorized")).toEqual(DEFAULT_QUERY);
    expect(
      serializeCatalogQuery({
        ...DEFAULT_QUERY,
        category: "uncategorized",
      }),
    ).toBe("");
  });

  test("exposes only structural categories and the six Extension functions", () => {
    expect(CATEGORY_OPTIONS.map(({ id }) => id)).toEqual([
      "",
      "frontend",
      "preset",
      "memory-retrieval",
      "generation-reasoning",
      "character-worldbuilding",
      "rpg-systems",
      "interface-workflow",
      "developer-infrastructure",
    ]);
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
