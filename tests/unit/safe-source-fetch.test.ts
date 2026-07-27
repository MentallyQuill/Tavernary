import { expect, test } from "vitest";

import {
  safeProbe,
  safeReadSource,
} from "../../scripts/submissions/safe-source-fetch.mjs";

test.each([
  "http://example.com/file",
  "https://user:pass@example.com/file",
  "https://127.0.0.1/file",
  "https://[::1]/file",
  "https://example.com:8443/file",
])("rejects unsafe source URL %s", async (url) => {
  await expect(
    safeProbe(url, {
      fetchImpl: () => {
        throw new Error("fetch must not run");
      },
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    }),
  ).rejects.toThrow(/safe public HTTPS source/iu);
});

test("rejects a hostname resolving to a private address before fetch", async () => {
  await expect(
    safeProbe("https://example.com/file", {
      fetchImpl: () => {
        throw new Error("fetch must not run");
      },
      lookup: async () => [{ address: "10.1.2.3", family: 4 }],
    }),
  ).rejects.toThrow(/safe public HTTPS source/iu);
});

test("permits a public address adjacent to a documentation subnet", async () => {
  const result = await safeProbe("https://example.com/file", {
    lookup: async () => [{ address: "198.51.1.1", family: 4 }],
    fetchImpl: async () => new Response("ok", { status: 200 }),
  });

  expect(result.status).toBe(200);
});

test("returns bounded metadata for a reachable public source", async () => {
  const result = await safeProbe("https://example.com/file", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async (_url, init) => {
      expect(init).toMatchObject({
        method: "GET",
        redirect: "manual",
        headers: { Range: "bytes=0-262143" },
      });
      return new Response("preset", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": "6",
        },
      });
    },
  });

  expect(result).toEqual({
    finalUrl: "https://example.com/file",
    status: 200,
    contentType: "text/plain",
    contentLength: 6,
    redirects: [],
  });
});

test("revalidates every allowed redirect destination", async () => {
  const requested: string[] = [];
  const result = await safeProbe("https://old.example/source", {
    allowedRedirectHosts: new Set(["old.example", "new.example"]),
    lookup: async (hostname: string) => {
      expect(["old.example", "new.example"]).toContain(hostname);
      return [{ address: "93.184.216.34", family: 4 }];
    },
    fetchImpl: async (url) => {
      requested.push(String(url));
      return requested.length === 1
        ? new Response(null, {
            status: 302,
            headers: { location: "https://new.example/canonical" },
          })
        : new Response("ok", { status: 200 });
    },
  });

  expect(result).toMatchObject({
    finalUrl: "https://new.example/canonical",
    status: 200,
    redirects: ["https://new.example/canonical"],
  });
});

test("reads a bounded body with caller headers", async () => {
  const result = await safeReadSource("https://www.reddit.com/post.json", {
    maxBytes: 32,
    headers: {
      accept: "application/json",
      "user-agent": "Tavernary-catalog-enrichment",
    },
    lookup: async () => [{ address: "151.101.1.140", family: 4 }],
    fetchImpl: async (_url, init) => {
      expect(init?.headers).toMatchObject({
        accept: "application/json",
        "user-agent": "Tavernary-catalog-enrichment",
      });
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  expect(new TextDecoder().decode(result.body)).toBe('{"ok":true}');
});

test("cancels a streamed body after the safe byte limit", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(20));
      controller.enqueue(new Uint8Array(20));
      controller.close();
    },
  });

  await expect(
    safeReadSource("https://www.reddit.com/post.json", {
      maxBytes: 32,
      lookup: async () => [{ address: "151.101.1.140", family: 4 }],
      fetchImpl: async () => new Response(stream, { status: 200 }),
    }),
  ).rejects.toThrow("safe size limit");
});
