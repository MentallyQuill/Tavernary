import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { resolveScanRequest } from "../../scripts/security/resolve-tavernkeeper-scan-request.mjs";

const approvedId = 2_625_904;
const recursionSource = {
  schema_version: 1,
  id: "github-1285208664",
  type: "github",
  repository: "MentallyQuill/Recursion",
  repository_id: 1_285_208_664,
  status: "active",
};
const recursionProject = {
  id: "mentallyquill-recursion",
  source_id: recursionSource.id,
  listing_status: "active",
};

function resolve(overrides: Record<string, unknown> = {}) {
  return resolveScanRequest({
    repositoryUrl: "https://github.com/MentallyQuill/Recursion",
    actorId: approvedId,
    operators: [approvedId],
    sources: [recursionSource],
    projects: [recursionProject],
    ...overrides,
  });
}

describe("staff TavernKeeper scan request resolution", () => {
  test("returns tracked source and repository identity for an approved exact URL", () => {
    expect(resolve()).toEqual({
      sourceId: recursionSource.id,
      repositoryId: recursionSource.repository_id,
      repositoryUrl: "https://github.com/MentallyQuill/Recursion",
    });
  });

  test.each([
    "https://github.com/MentallyQuill/Recursion/",
    "https://github.com/MentallyQuill/Recursion.git",
    "https://github.com/MentallyQuill/Recursion?ref=main",
    "https://github.com/MentallyQuill/Recursion#readme",
    "http://github.com/MentallyQuill/Recursion",
    "https://www.github.com/MentallyQuill/Recursion",
    "https://github.com/mentallyquill/Recursion",
    "https://github.com/MentallyQuill/recursion",
  ])("rejects noncanonical repository URL %s", (repositoryUrl) => {
    expect(() => resolve({ repositoryUrl })).toThrow(/canonical GitHub/iu);
  });

  test("rejects actors absent from the immutable numeric allowlist", () => {
    expect(() => resolve({ actorId: 99 })).toThrow(/authorized/iu);
  });

  test("rejects unlisted, unsupported, inactive, and unpublished sources", () => {
    expect(() =>
      resolve({ repositoryUrl: "https://github.com/owner/unlisted" }),
    ).toThrow(/published Tavernary/iu);
    expect(() =>
      resolve({
        repositoryUrl: "https://github.com/MentallyQuill/Recursion",
        sources: [{ ...recursionSource, type: "codeberg" }],
      }),
    ).toThrow(/published Tavernary/iu);
    expect(() =>
      resolve({ sources: [{ ...recursionSource, status: "inactive" }] }),
    ).toThrow(/published Tavernary/iu);
    expect(() => resolve({ projects: [] })).toThrow(/published Tavernary/iu);
  });

  test("tracks only sorted unique positive numeric operator IDs", async () => {
    const config = JSON.parse(
      await readFile("config/tavernkeeper-scan-operators.json", "utf8"),
    ) as { github_user_ids: number[] };
    expect(config.github_user_ids).toContain(approvedId);
    expect(config.github_user_ids).toEqual(
      [...new Set(config.github_user_ids)].sort((left, right) => left - right),
    );
    expect(config.github_user_ids.every(Number.isSafeInteger)).toBe(true);
    expect(config.github_user_ids.every((id) => id > 0)).toBe(true);
  });
});
