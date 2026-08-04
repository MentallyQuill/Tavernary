import { readFile } from "node:fs/promises";

import Ajv from "ajv";
import { describe, expect, test } from "vitest";

import {
  buildTavernKeeperTargets as buildTargets,
  popularityRankedProjectIds,
} from "../../scripts/security/tavernkeeper-targets.mjs";

const generatedAt = "2026-07-31T12:00:00.000Z";

function buildTavernKeeperTargets(options: Record<string, unknown>) {
  return buildTargets({
    contractVersion: 1,
    projects: [],
    topProjectIds: new Set(),
    ...options,
  } as unknown as Parameters<typeof buildTargets>[0]);
}

function source(
  id: string,
  repositoryId: number,
  repository: string,
  type: "github" | "codeberg" = "github",
) {
  return {
    schema_version: 1,
    id,
    type,
    repository,
    repository_id: repositoryId,
    status: "active",
  };
}

function snapshot(
  sourceId: string,
  repositoryId: number,
  repository: string,
  sha: string,
  sourceHealth = "healthy",
) {
  const [owner, name] = repository.split("/");
  return {
    source_id: sourceId,
    provider: sourceId.startsWith("codeberg-") ? "codeberg" : "github",
    source_health: sourceHealth,
    stale_since: null,
    repository: {
      id: repositoryId,
      owner,
      name,
      url: `https://github.com/${repository}`,
      head_sha: sha,
    },
  };
}

describe("TavernKeeper target manifest", () => {
  test("vendors a strict V2 target contract and canonical fixture", async () => {
    const [schema, fixture] = await Promise.all(
      [
        "data/schemas/tavernkeeper-targets.v2.schema.json",
        "tests/fixtures/tavernkeeper/targets.v2.valid.json",
      ].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
    );
    const validate = new Ajv({
      allErrors: true,
      formats: { "date-time": true, uri: true },
      strict: true,
    }).compile(schema);

    expect(validate(fixture)).toBe(true);
    expect(
      validate({
        ...structuredClone(fixture),
        repositories: fixture.repositories.map(
          (repository: Record<string, unknown>) => {
            const withoutProjectKinds = { ...repository };
            delete withoutProjectKinds.project_kinds;
            return withoutProjectKinds;
          },
        ),
      }),
    ).toBe(false);
    expect(
      validate({
        ...structuredClone(fixture),
        repositories: fixture.repositories.map(
          (repository: Record<string, unknown>) => ({
            ...repository,
            unexpected: true,
          }),
        ),
      }),
    ).toBe(false);
  });

  test("vendors a strict V3 contract with a complete positive rank", async () => {
    const [schema, fixture] = await Promise.all(
      [
        "data/schemas/tavernkeeper-targets.v3.schema.json",
        "tests/fixtures/tavernkeeper/targets.v3.valid.json",
      ].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
    );
    const validate = new Ajv({
      allErrors: true,
      formats: { "date-time": true, uri: true },
      strict: true,
    }).compile(schema);

    expect(validate(fixture)).toBe(true);
    expect(
      validate({
        ...structuredClone(fixture),
        repositories: fixture.repositories.map(
          (repository: Record<string, unknown>) => ({
            ...repository,
            catalog_priority: {
              ...(repository.catalog_priority as Record<string, unknown>),
              popularity_rank: 0,
            },
          }),
        ),
      }),
    ).toBe(false);
    expect(
      validate({
        ...structuredClone(fixture),
        repositories: fixture.repositories.map(
          (repository: Record<string, unknown>) => {
            const catalogPriority = {
              ...(repository.catalog_priority as Record<string, unknown>),
            };
            delete catalogPriority.popularity_rank;
            return { ...repository, catalog_priority: catalogPriority };
          },
        ),
      }),
    ).toBe(false);
  });

  test("publishes every V3 repository with its exact popularity order", () => {
    const projects = [
      {
        id: "lowest",
        name: "Lowest",
        source_id: "github-100",
        kind: "extension",
        cataloged_at: "2026-07-01T00:00:00.000Z",
        community: { aggregate: 10 },
      },
      {
        id: "highest",
        name: "Highest",
        source_id: "github-300",
        kind: "extension",
        cataloged_at: "2026-07-01T00:00:00.000Z",
        community: { aggregate: 30 },
      },
      {
        id: "middle",
        name: "Middle",
        source_id: "github-200",
        kind: "frontend",
        cataloged_at: "2026-07-01T00:00:00.000Z",
        community: { aggregate: 20 },
      },
      {
        id: "highest-preset",
        name: "Highest preset",
        source_id: "github-300",
        kind: "preset",
        cataloged_at: "2026-06-01T00:00:00.000Z",
        community: { aggregate: 40 },
      },
    ];
    const rankedProjectIds = popularityRankedProjectIds(projects);
    const manifest = buildTargets({
      contractVersion: 3,
      generatedAt,
      publishedSourceIds: new Set(["github-100", "github-200", "github-300"]),
      sources: [
        source("github-100", 100, "owner/lowest"),
        source("github-200", 200, "owner/middle"),
        source("github-300", 300, "owner/highest"),
      ],
      snapshots: [
        snapshot("github-100", 100, "owner/lowest", "a".repeat(40)),
        snapshot("github-200", 200, "owner/middle", "b".repeat(40)),
        snapshot("github-300", 300, "owner/highest", "c".repeat(40)),
      ],
      projects,
      rankedProjectIds,
      topProjectIds: new Set(rankedProjectIds.slice(0, 30)),
    });

    expect(manifest).toMatchObject({
      schema_version: 3,
      repositories: [
        { repository_id: 100, catalog_priority: { popularity_rank: 4 } },
        { repository_id: 200, catalog_priority: { popularity_rank: 3 } },
        { repository_id: 300, catalog_priority: { popularity_rank: 2 } },
      ],
    });
  });

  test("preserves project-derived rank gaps for repositories with shared cards", () => {
    const projects = [
      {
        id: "shared-first",
        name: "Shared first",
        source_id: "github-100",
        kind: "extension",
        cataloged_at: "2026-07-01T00:00:00.000Z",
        community: { aggregate: 30 },
      },
      {
        id: "shared-second",
        name: "Shared second",
        source_id: "github-100",
        kind: "frontend",
        cataloged_at: "2026-07-02T00:00:00.000Z",
        community: { aggregate: 20 },
      },
      {
        id: "third",
        name: "Third",
        source_id: "github-200",
        kind: "extension",
        cataloged_at: "2026-07-03T00:00:00.000Z",
        community: { aggregate: 10 },
      },
    ];
    const rankedProjectIds = popularityRankedProjectIds(projects);
    const manifest = buildTargets({
      contractVersion: 3,
      generatedAt,
      publishedSourceIds: new Set(["github-100", "github-200"]),
      sources: [
        source("github-100", 100, "owner/shared"),
        source("github-200", 200, "owner/third"),
      ],
      snapshots: [
        snapshot("github-100", 100, "owner/shared", "a".repeat(40)),
        snapshot("github-200", 200, "owner/third", "b".repeat(40)),
      ],
      projects,
      rankedProjectIds,
      topProjectIds: new Set(rankedProjectIds.slice(0, 30)),
    });

    expect(manifest.repositories).toMatchObject([
      { catalog_priority: { top_30: true, popularity_rank: 1 } },
      { catalog_priority: { top_30: true, popularity_rank: 3 } },
    ]);
  });

  test("publishes V2 metadata only from supported cards sharing a GitHub source", () => {
    const manifest = buildTargets({
      contractVersion: 2,
      generatedAt,
      publishedSourceIds: new Set(["github-42"]),
      sources: [source("github-42", 42, "owner/repo")],
      snapshots: [snapshot("github-42", 42, "owner/repo", "a".repeat(40))],
      projects: [
        {
          id: "extension-card",
          source_id: "github-42",
          kind: "extension",
          cataloged_at: "2026-07-02T00:00:00.000Z",
        },
        {
          id: "preset-card",
          source_id: "github-42",
          kind: "preset",
          cataloged_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      topProjectIds: new Set(["extension-card"]),
    });

    expect(manifest).toEqual({
      schema_version: 2,
      generated_at: generatedAt,
      repositories: [
        {
          source_id: "github-42",
          provider: "github",
          repository_id: 42,
          repository: "owner/repo",
          target_sha: "a".repeat(40),
          canonical_url: "https://github.com/owner/repo",
          project_kinds: ["extension"],
          catalog_priority: {
            top_30: true,
            first_cataloged_at: "2026-07-02T00:00:00.000Z",
          },
        },
      ],
    });
  });

  test("omits sources published only as unsupported presets", () => {
    const manifest = buildTargets({
      contractVersion: 2,
      generatedAt,
      publishedSourceIds: new Set(["github-42"]),
      sources: [source("github-42", 42, "owner/preset")],
      snapshots: [snapshot("github-42", 42, "owner/preset", "a".repeat(40))],
      projects: [
        {
          id: "preset-card",
          source_id: "github-42",
          kind: "preset",
          cataloged_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      topProjectIds: new Set(["preset-card"]),
    });

    expect(manifest.repositories).toEqual([]);
  });

  test("requires an explicit supported contract version", () => {
    expect(() =>
      (buildTargets as (options: Record<string, unknown>) => unknown)({
        generatedAt,
        publishedSourceIds: new Set(),
        sources: [],
        snapshots: [],
        projects: [],
        topProjectIds: new Set(),
      }),
    ).toThrow(/contract version/iu);
    expect(() =>
      (buildTargets as (options: Record<string, unknown>) => unknown)({
        contractVersion: 4,
        generatedAt,
        publishedSourceIds: new Set(),
        sources: [],
        snapshots: [],
        projects: [],
        topProjectIds: new Set(),
      }),
    ).toThrow(/contract version/iu);
  });

  test("publishes healthy GitHub sources at exact SHAs in stable identity order", () => {
    const manifest = buildTavernKeeperTargets({
      generatedAt,
      publishedSourceIds: new Set(["github-7", "github-42"]),
      sources: [
        source("github-42", 42, "owner/second"),
        source("github-7", 7, "owner/first"),
        source("codeberg-8", 8, "owner/codeberg", "codeberg"),
      ],
      snapshots: [
        snapshot("github-42", 42, "owner/second", "b".repeat(40)),
        snapshot("github-7", 7, "owner/first", "a".repeat(40)),
        snapshot("codeberg-8", 8, "owner/codeberg", "c".repeat(40)),
      ],
    });

    expect(manifest).toEqual({
      schema_version: 1,
      generated_at: generatedAt,
      repositories: [
        {
          source_id: "github-7",
          provider: "github",
          repository_id: 7,
          repository: "owner/first",
          target_sha: "a".repeat(40),
          canonical_url: "https://github.com/owner/first",
        },
        {
          source_id: "github-42",
          provider: "github",
          repository_id: 42,
          repository: "owner/second",
          target_sha: "b".repeat(40),
          canonical_url: "https://github.com/owner/second",
        },
      ],
    });
  });

  test("omits stale, identity-changing, missing, and malformed SHA targets", () => {
    expect(
      buildTavernKeeperTargets({
        generatedAt,
        publishedSourceIds: new Set(["github-1", "github-2", "github-3"]),
        sources: [
          source("github-1", 1, "owner/stale"),
          source("github-2", 2, "owner/missing"),
          source("github-3", 3, "owner/malformed"),
        ],
        snapshots: [
          snapshot("github-1", 1, "owner/stale", "a".repeat(40), "unavailable"),
          snapshot("github-3", 3, "owner/malformed", "main"),
        ],
      }).repositories,
    ).toEqual([]);
  });

  test("publishes targets only for sources with a public project card", () => {
    expect(
      buildTavernKeeperTargets({
        generatedAt,
        publishedSourceIds: new Set(["github-7"]),
        sources: [
          source("github-7", 7, "owner/public"),
          source("github-42", 42, "owner/retained"),
        ],
        snapshots: [
          snapshot("github-7", 7, "owner/public", "a".repeat(40)),
          snapshot("github-42", 42, "owner/retained", "b".repeat(40)),
        ],
      }).repositories.map(({ source_id }) => source_id),
    ).toEqual(["github-7"]);
  });

  test("omits a healthy snapshot retained after it became stale", () => {
    expect(
      buildTavernKeeperTargets({
        generatedAt,
        publishedSourceIds: new Set(["github-42"]),
        sources: [source("github-42", 42, "owner/repo")],
        snapshots: [
          {
            ...snapshot("github-42", 42, "owner/repo", "a".repeat(40)),
            stale_since: "2026-07-31T11:00:00.000Z",
          },
        ],
      }).repositories,
    ).toEqual([]);
  });

  test("omits snapshots whose repository full name conflicts with the source", () => {
    expect(
      buildTavernKeeperTargets({
        generatedAt,
        publishedSourceIds: new Set(["github-42"]),
        sources: [source("github-42", 42, "owner/expected")],
        snapshots: [snapshot("github-42", 42, "owner/other", "a".repeat(40))],
      }).repositories,
    ).toEqual([]);
  });

  test("omits inactive sources, non-GitHub snapshots, and repository-ID mismatches", () => {
    expect(
      buildTavernKeeperTargets({
        generatedAt,
        publishedSourceIds: new Set(["github-7", "github-8", "github-9"]),
        sources: [
          { ...source("github-7", 7, "owner/inactive"), status: "inactive" },
          source("github-8", 8, "owner/provider"),
          source("github-9", 9, "owner/identity"),
        ],
        snapshots: [
          snapshot("github-7", 7, "owner/inactive", "a".repeat(40)),
          {
            ...snapshot("github-8", 8, "owner/provider", "b".repeat(40)),
            provider: "codeberg",
          },
          snapshot("github-9", 99, "owner/identity", "c".repeat(40)),
        ],
      }).repositories,
    ).toEqual([]);
  });

  test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "omits a non-positive or unsafe repository ID: %s",
    (repositoryId) => {
      expect(
        buildTavernKeeperTargets({
          generatedAt,
          publishedSourceIds: new Set(["github-invalid"]),
          sources: [source("github-invalid", repositoryId, "owner/repo")],
          snapshots: [
            snapshot(
              "github-invalid",
              repositoryId,
              "owner/repo",
              "a".repeat(40),
            ),
          ],
        }).repositories,
      ).toEqual([]);
    },
  );

  test("derives the canonical URL from the authoritative source identity", () => {
    const retained = snapshot("github-42", 42, "owner/repo", "a".repeat(40));
    retained.repository.url = "https://example.test/untrusted";

    expect(
      buildTavernKeeperTargets({
        generatedAt,
        publishedSourceIds: new Set(["github-42"]),
        sources: [source("github-42", 42, "owner/repo")],
        snapshots: [retained],
      }).repositories[0]?.canonical_url,
    ).toBe("https://github.com/owner/repo");
  });

  test("deduplicates identical repository IDs in stable source order", () => {
    const duplicateSource = source("github-42", 42, "owner/repo");
    const manifest = buildTavernKeeperTargets({
      generatedAt,
      publishedSourceIds: new Set(["github-42"]),
      sources: [duplicateSource, structuredClone(duplicateSource)],
      snapshots: [snapshot("github-42", 42, "owner/repo", "a".repeat(40))],
    });

    expect(manifest.repositories).toHaveLength(1);
    expect(manifest.repositories[0]?.source_id).toBe("github-42");
  });

  test("rejects conflicting duplicate repository IDs deterministically", () => {
    const sources = [
      source("github-84", 42, "owner/zeta"),
      source("github-42", 42, "owner/alpha"),
    ];
    const snapshots = [
      snapshot("github-84", 42, "owner/zeta", "a".repeat(40)),
      snapshot("github-42", 42, "owner/alpha", "b".repeat(40)),
    ];
    const build = (reverse: boolean) =>
      buildTavernKeeperTargets({
        generatedAt,
        publishedSourceIds: new Set(["github-84", "github-42"]),
        sources: reverse ? [...sources].reverse() : sources,
        snapshots: reverse ? [...snapshots].reverse() : snapshots,
      });

    expect(() => build(false)).toThrow(
      "TavernKeeper targets contain a conflicting duplicate repository id",
    );
    expect(() => build(true)).toThrow(
      "TavernKeeper targets contain a conflicting duplicate repository id",
    );
  });
});
