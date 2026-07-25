import { describe, expect, test } from "vitest";

import { DEFAULT_KIT_QUERY } from "@/features/kits/kit-query";
import { selectKits } from "@/features/kits/kit-selectors";
import type { CatalogKit } from "@/features/kits/kit-types";

const label = (id: string) => ({ id, label: id, description: id });

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
