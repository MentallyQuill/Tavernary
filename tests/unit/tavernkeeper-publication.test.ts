import { describe, expect, test } from "vitest";

import {
  manifestDigest,
  readPublicManifest,
  verifyPublicManifest,
} from "../../scripts/security/tavernkeeper-publication.mjs";

const publicManifestUrl =
  "https://mentallyquill.github.io/Tavernary/security/tavernkeeper-targets.json";

function publicDnsLookup() {
  return Promise.resolve([{ address: "8.8.8.8", family: 4 }]);
}

function manifestResponse() {
  return new Response(
    JSON.stringify({
      schema_version: 1,
      generated_at: "2026-08-01T00:00:00.000Z",
      repositories: [],
    }),
    { headers: { "content-type": "application/json" } },
  );
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

  test.each([
    "http://mentallyquill.github.io/Tavernary/security/tavernkeeper-targets.json",
    "https://example.test/Tavernary/security/tavernkeeper-targets.json",
    "https://mentallyquill.github.io/Tavernary/security/other.json",
    "https://mentallyquill.github.io/Tavernary/security/tavernkeeper-targets.json?cache=bust",
    "https://user:password@mentallyquill.github.io/Tavernary/security/tavernkeeper-targets.json",
    "https://mentallyquill.github.io:8443/Tavernary/security/tavernkeeper-targets.json",
  ])("rejects an unsafe public-manifest URL: %s", async (url) => {
    await expect(
      readPublicManifest(url, {
        dnsLookup: async () => {
          throw new Error("DNS must not run for an unsafe URL");
        },
      }),
    ).rejects.toThrow(/unsafe/u);
  });

  test("accepts a same-origin redirect to the fixed public manifest", async () => {
    let requests = 0;

    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: publicDnsLookup,
        fetchImpl: async () => {
          requests += 1;
          return requests === 1
            ? new Response(null, {
                headers: { location: publicManifestUrl },
                status: 302,
              })
            : manifestResponse();
        },
      }),
    ).resolves.toMatchObject({ schema_version: 1, repositories: [] });
    expect(requests).toBe(2);
  });

  test.each([
    "https://example.test/Tavernary/security/tavernkeeper-targets.json",
    "/Tavernary/security/other.json",
  ])("rejects an unsafe redirect destination: %s", async (location) => {
    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: publicDnsLookup,
        fetchImpl: async () =>
          new Response(null, { headers: { location }, status: 302 }),
      }),
    ).rejects.toThrow(/unsafe/u);
  });

  test("rejects a third same-origin redirect", async () => {
    let redirects = 0;

    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: publicDnsLookup,
        fetchImpl: async () => {
          redirects += 1;
          return new Response(null, {
            headers: { location: publicManifestUrl },
            status: 302,
          });
        },
      }),
    ).rejects.toThrow(/redirect limit/u);
    expect(redirects).toBe(3);
  });

  test("treats only an HTTP 404 as an unpublished manifest", async () => {
    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: publicDnsLookup,
        fetchImpl: async () => new Response(null, { status: 404 }),
      }),
    ).rejects.toThrow(/not published yet/u);
    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: publicDnsLookup,
        fetchImpl: async () => new Response(null, { status: 503 }),
      }),
    ).rejects.toThrow(/HTTP 503/u);
  });

  test("rejects an oversized declared public-manifest response", async () => {
    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: publicDnsLookup,
        fetchImpl: async () =>
          new Response("{}", {
            headers: {
              "content-length": String(2 * 1024 * 1024 + 1),
              "content-type": "application/json",
            },
          }),
      }),
    ).rejects.toThrow(/size limit/u);
  });

  test("rejects an oversized streamed public-manifest response", async () => {
    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: publicDnsLookup,
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
                controller.close();
              },
            }),
            { headers: { "content-type": "application/json" } },
          ),
      }),
    ).rejects.toThrow(/size limit/u);
  });

  test("does not await cancellation after rejecting an oversized stream", async () => {
    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: publicDnsLookup,
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
              },
              cancel() {
                return new Promise(() => {});
              },
            }),
            { headers: { "content-type": "application/json" } },
          ),
        timeoutMs: 10,
      }),
    ).rejects.toThrow(/size limit/u);
  });

  test("bounds DNS lookup with the public-manifest request deadline", async () => {
    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: async () => new Promise(() => {}),
        timeoutMs: 10,
      }),
    ).rejects.toThrow(/timed out/u);
  });

  test("bounds an injected request that ignores the abort signal", async () => {
    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: publicDnsLookup,
        requestImpl: async () => new Promise(() => {}),
        timeoutMs: 10,
      }),
    ).rejects.toThrow(/timed out/u);
  });

  test("bounds an injected response body that never yields", async () => {
    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: publicDnsLookup,
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              pull() {
                return new Promise(() => {});
              },
            }),
            { headers: { "content-type": "application/json" } },
          ),
        timeoutMs: 10,
      }),
    ).rejects.toThrow(/timed out/u);
  });

  test.each([
    "::",
    "::1",
    "fe80::1",
    "febf::1",
    "ff02::1",
    "fec0::1",
    "feff::1",
    "fc00::1",
    "fdff::1",
    "2001:db8::1",
    "::ffff:7f00:1",
    "::ffff:8.8.8.8",
    "10.0.0.1",
    "169.254.1.1",
    "192.168.1.1",
    "198.51.100.1",
  ])("rejects non-public DNS address %s", async (address) => {
    await expect(
      readPublicManifest(publicManifestUrl, {
        dnsLookup: async () => [{ address, family: 6 }],
        fetchImpl: async () => {
          throw new Error("request transport should not run");
        },
      }),
    ).rejects.toThrow(/resolve publicly/u);
  });
});
