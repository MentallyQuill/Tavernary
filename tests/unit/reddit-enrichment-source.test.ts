import { expect, test, vi } from "vitest";

import { loadRedditEnrichmentSource } from "../../scripts/catalog/reddit-enrichment-source.mjs";

const record = {
  id: "reddit-1v64r6z",
  source: {
    type: "url",
    url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update_writers_block_5_a_prose_and_narrative/",
  },
};

function listing(overrides: Record<string, unknown> = {}) {
  return [
    {
      data: {
        children: [
          {
            kind: "t3",
            data: {
              id: "1v64r6z",
              title: "Writer's Block 5",
              selftext: "A prose and narrative preset with director controls.",
              removed_by_category: null,
              banned_by: null,
              ...overrides,
            },
          },
        ],
      },
    },
    {
      data: {
        children: [{ kind: "t1", data: { body: "ignore comment" } }],
      },
    },
  ];
}

function response(
  payload: unknown,
  overrides: {
    status?: number;
    contentType?: string | null;
    body?: Uint8Array;
  } = {},
) {
  return {
    finalUrl:
      "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update_writers_block_5_a_prose_and_narrative.json?raw_json=1&limit=1",
    status: overrides.status ?? 200,
    contentType:
      overrides.contentType === undefined
        ? "application/json; charset=UTF-8"
        : overrides.contentType,
    contentLength: null,
    redirects: [],
    body: overrides.body ?? new TextEncoder().encode(JSON.stringify(payload)),
  };
}

test("uses Reddit self-text and excludes comments", async () => {
  const source = await loadRedditEnrichmentSource(record, {
    readSource: async () => response(listing()),
  });

  expect(source).toMatchObject({
    status: "ready",
    sourceKind: "reddit-body",
    text: "A prose and narrative preset with director controls.",
    sourceIdentity: "reddit:1v64r6z",
    redditPostId: "1v64r6z",
  });
  if (source.status !== "ready") throw new Error("expected ready source");
  expect(source.text).not.toContain("ignore comment");
});

test("uses the title when a live post has no self-text", async () => {
  const source = await loadRedditEnrichmentSource(record, {
    readSource: async () => response(listing({ selftext: "" })),
  });

  expect(source).toMatchObject({
    status: "ready",
    sourceKind: "reddit-title",
    text: "Writer's Block 5",
    sourceIdentity: "reddit:1v64r6z",
    redditPostId: "1v64r6z",
  });
});

test("uses a bounded oEmbed title when Reddit blocks the post listing", async () => {
  const readSource = vi
    .fn()
    .mockResolvedValueOnce(
      response([], {
        status: 403,
        contentType: "text/html",
      }),
    )
    .mockResolvedValueOnce(
      response({
        type: "rich",
        provider_name: "reddit",
        title: "Writer's Block 5",
        html: '<blockquote data-embed-height="316"><a href="https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/">post</a></blockquote>',
      }),
    );

  await expect(
    loadRedditEnrichmentSource(record, { readSource }),
  ).resolves.toMatchObject({
    status: "ready",
    sourceKind: "reddit-title",
    text: "Writer's Block 5",
    sourceIdentity: "reddit:1v64r6z",
    redditPostId: "1v64r6z",
  });
  expect(readSource).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining("https://www.reddit.com/oembed?"),
    expect.objectContaining({
      maxBytes: 65_536,
      maxRedirects: 1,
      timeoutMs: 10_000,
    }),
  );
});

test("rejects an oEmbed response for another Reddit post", async () => {
  const readSource = vi
    .fn()
    .mockResolvedValueOnce(response([], { status: 403 }))
    .mockResolvedValueOnce(
      response({
        type: "rich",
        provider_name: "reddit",
        title: "Another post",
        html: '<a href="https://www.reddit.com/comments/different/">post</a>',
      }),
    );

  await expect(
    loadRedditEnrichmentSource(record, { readSource }),
  ).resolves.toMatchObject({
    status: "failed",
    reasonCode: "reddit-identity-mismatch",
  });
});

test.each([
  [
    "post ID mismatch",
    listing({ id: "different" }),
    "reddit-identity-mismatch",
  ],
  [
    "removed post",
    listing({ removed_by_category: "moderator" }),
    "reddit-post-unavailable",
  ],
  [
    "deleted post",
    listing({ selftext: "[deleted]", title: "[deleted]" }),
    "reddit-post-unavailable",
  ],
  ["malformed listing", { data: {} }, "reddit-response-invalid"],
] as const)(
  "%s has a controlled failure",
  async (_name, payload, reasonCode) => {
    await expect(
      loadRedditEnrichmentSource(record, {
        readSource: async () => response(payload),
      }),
    ).resolves.toMatchObject({
      status: "failed",
      reasonCode,
      sourceIdentity: "reddit:1v64r6z",
      redditPostId: "1v64r6z",
    });
  },
);

test.each([
  [404, "reddit-post-unavailable"],
  [410, "reddit-post-unavailable"],
  [429, "reddit-rate-limited"],
  [503, "reddit-server-error"],
] as const)("maps HTTP %i to %s", async (status, reasonCode) => {
  await expect(
    loadRedditEnrichmentSource(record, {
      readSource: async () => response([], { status }),
    }),
  ).resolves.toMatchObject({
    status: "failed",
    reasonCode,
    sourceIdentity: "reddit:1v64r6z",
    redditPostId: "1v64r6z",
  });
});

test.each([
  ["non-JSON response", response(listing(), { contentType: "text/html" })],
  ["invalid UTF-8", response(listing(), { body: new Uint8Array([0xff]) })],
  [
    "invalid JSON",
    response(listing(), { body: new TextEncoder().encode("{not-json") }),
  ],
] as const)("%s is rejected safely", async (_name, result) => {
  await expect(
    loadRedditEnrichmentSource(record, {
      readSource: async () => result,
    }),
  ).resolves.toMatchObject({
    status: "failed",
    reasonCode: "reddit-response-invalid",
  });
});

test("rejects a non-Reddit source without fetching", async () => {
  let fetched = false;
  await expect(
    loadRedditEnrichmentSource(
      {
        id: "external",
        source: { type: "url", url: "https://example.com/preset" },
      },
      {
        readSource: async () => {
          fetched = true;
          return response([]);
        },
      },
    ),
  ).resolves.toMatchObject({
    status: "failed",
    reasonCode: "unsupported-enrichment-source",
  });
  expect(fetched).toBe(false);
});

test("uses a fixed Reddit JSON endpoint with bounded options", async () => {
  let request: { url: string; options: object } | undefined;
  await loadRedditEnrichmentSource(record, {
    readSource: async (url, options) => {
      request = { url, options: options ?? {} };
      return response(listing());
    },
  });

  expect(request?.url).toBe(
    "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update_writers_block_5_a_prose_and_narrative.json?raw_json=1&limit=1",
  );
  expect(request?.options).toMatchObject({
    maxBytes: 524_288,
    maxRedirects: 2,
    timeoutMs: 10_000,
    headers: {
      accept: "application/json",
      "user-agent": "Tavernary-catalog-enrichment",
    },
  });
});
