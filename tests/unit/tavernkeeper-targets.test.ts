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
        sources: [
          source("github-1", 1, "owner/stale"),
          source("github-2", 2, "owner/missing"),
          source("github-3", 3, "owner/malformed"),
        ],
        snapshots: [
          snapshot(
            "github-1",
            1,
            "owner/stale",
            "a".repeat(40),
            "unavailable",
          ),
          snapshot("github-3", 3, "owner/malformed", "main"),
        ],
      }).repositories,
    ).toEqual([]);
  });
});
