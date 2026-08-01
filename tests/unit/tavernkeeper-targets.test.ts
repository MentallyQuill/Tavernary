import { describe, expect, test } from "vitest";

import { buildTavernKeeperTargets } from "../../scripts/security/tavernkeeper-targets.mjs";

const generatedAt = "2026-07-31T12:00:00.000Z";

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
