import { describe, expect, test } from "vitest";

import {
  manifestDigest,
  verifyPublicManifest,
} from "../../scripts/security/tavernkeeper-publication.mjs";

const publicManifestUrl =
  "https://mentallyquill.github.io/Tavernary/security/tavernkeeper-targets.json";

function publicDnsLookup() {
  return Promise.resolve([{ address: "8.8.8.8", family: 4 }]);
}

describe("TavernKeeper target publication", () => {
  test("hashes structurally identical manifests identically regardless of object key order", () => {
    const first = {
      repositories: [
        {
          canonical_url: "https://github.com/owner/repo",
          provider: "github",
          repository: "owner/repo",
          repository_id: 42,
          source_id: "github-42",
          target_sha: "a".repeat(40),
        },
      ],
      generated_at: "2026-08-01T00:00:00.000Z",
      schema_version: 1,
    };
    const structurallyIdentical = {
      schema_version: 1,
      generated_at: "2026-08-01T00:00:00.000Z",
      repositories: [
        {
          target_sha: "a".repeat(40),
          source_id: "github-42",
          repository_id: 42,
          repository: "owner/repo",
          provider: "github",
          canonical_url: "https://github.com/owner/repo",
        },
      ],
    };

    expect(manifestDigest(first)).toBe(manifestDigest(structurallyIdentical));
  });

  test("rejects a public manifest whose canonical digest differs from the deployed target", async () => {
    await expect(
      verifyPublicManifest(publicManifestUrl, "0".repeat(64), {
        dnsLookup: publicDnsLookup,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              schema_version: 1,
              generated_at: "2026-08-01T00:00:00.000Z",
              repositories: [],
            }),
            { headers: { "content-type": "application/json" } },
          ),
      }),
    ).rejects.toThrow(/digest/u);
  });

  test("rejects private public-manifest DNS answers before performing a request", async () => {
    await expect(
      verifyPublicManifest(publicManifestUrl, "0".repeat(64), {
        dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
        fetchImpl: async () => {
          throw new Error("request transport should not run");
        },
      }),
    ).rejects.toThrow(/resolve publicly/u);
  });
});
