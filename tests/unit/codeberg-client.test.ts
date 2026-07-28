import { expect, test, vi } from "vitest";

import {
  codebergRequest,
  listReleases,
  parseCodebergRateLimit,
} from "../../scripts/catalog/codeberg-client.mjs";

function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("requests only the fixed Codeberg API origin", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: 1699613 }));
  await codebergRequest("/repos/targren/Lumiverse-SwipeScrubber", {
    fetchImpl,
  });
  expect(fetchImpl).toHaveBeenCalledWith(
    "https://codeberg.org/api/v1/repos/targren/Lumiverse-SwipeScrubber",
    expect.objectContaining({
      headers: expect.objectContaining({
        Accept: "application/json",
        "User-Agent": expect.stringContaining("Tavernary"),
      }),
    }),
  );
});

test("rejects an absolute or traversal API path", async () => {
  await expect(codebergRequest("https://evil.example/api", {})).rejects.toThrow(
    "Codeberg API path must be relative",
  );
  await expect(codebergRequest("/../admin", {})).rejects.toThrow(
    "Codeberg API path is unsafe",
  );
});

test("parses Codeberg rate-limit policy and remaining headers", () => {
  const headers = new Headers({
    "ratelimit-policy": '"baseline";q=2000;w=600',
    ratelimit: '"baseline";r=1990;t=600',
  });
  expect(parseCodebergRateLimit(headers)).toEqual({
    limit: 2000,
    remaining: 1990,
    resetSeconds: 600,
  });
});

test.each([
  [404, false, "not-found"],
  [429, true, "rate-limited"],
  [503, true, "server-error"],
] as const)("classifies status %s", async (status, retryable, code) => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(jsonResponse({ message: "failed" }, status));
  await expect(
    codebergRequest("/repos/example/missing", { fetchImpl }),
  ).rejects.toMatchObject({ status, retryable, code });
});

test("normalizes a missing releases route only in listReleases", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(jsonResponse({ message: "missing" }, 404));
  await expect(
    listReleases("targren/Lumiverse-SwipeScrubber", { fetchImpl }),
  ).resolves.toEqual({ data: [], requestCount: 1 });
  await expect(
    codebergRequest("/repos/targren/Lumiverse-SwipeScrubber/releases", {
      fetchImpl,
    }),
  ).rejects.toMatchObject({ status: 404 });
});
