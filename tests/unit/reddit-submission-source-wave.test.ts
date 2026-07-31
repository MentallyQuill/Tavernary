import { expect, test, vi } from "vitest";

import { loadRedditSubmissionSourceWave } from "../../scripts/submissions/reddit-submission-source-wave.mjs";

const project = { id: "reddit-1v9u18m" };
const source = {
  id: "url-reddit-1v9u18m",
  type: "url",
  url: "https://www.reddit.com/r/SillyTavernAI/comments/1v9u18m/example/",
};
const failure = {
  status: "failed" as const,
  reasonCode: "reddit-rate-limited" as const,
  message: "The Reddit source request was rate limited.",
  sourceIdentity: "reddit:1v9u18m",
  redditPostId: "1v9u18m",
};

test("runs three source loads with 30s and 60s backoffs", async () => {
  const loadSource = vi.fn(async () => failure);
  const sleep = vi.fn(async (_milliseconds: number) => undefined);

  await expect(
    loadRedditSubmissionSourceWave({
      project,
      source,
      snapshot: null,
      loadSource,
      sleep,
    }),
  ).resolves.toEqual({
    status: "exhausted",
    failure,
    attempts: 3,
  });

  expect(loadSource).toHaveBeenCalledTimes(3);
  expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
    30_000, 60_000,
  ]);
});

test("stops at the first ready source", async () => {
  const ready = {
    status: "ready" as const,
    sourceKind: "reddit-body" as const,
    text: "Source-grounded Reddit post body.",
    sourceIdentity: "reddit:1v9u18m",
    redditPostId: "1v9u18m",
  };
  const loadSource = vi
    .fn()
    .mockResolvedValueOnce(failure)
    .mockResolvedValueOnce(ready);
  const sleep = vi.fn(async (_milliseconds: number) => undefined);

  await expect(
    loadRedditSubmissionSourceWave({
      project,
      source,
      snapshot: null,
      loadSource,
      sleep,
    }),
  ).resolves.toEqual({ status: "ready", source: ready, attempts: 2 });
  expect(loadSource).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledTimes(1);
});

test.each([
  "unsupported-enrichment-source",
  "reddit-identity-mismatch",
] as const)(
  "blocks integrity failure %s without retrying",
  async (reasonCode) => {
    const integrityFailure = { ...failure, reasonCode };
    const loadSource = vi.fn(async () => integrityFailure);
    const sleep = vi.fn(async (_milliseconds: number) => undefined);

    await expect(
      loadRedditSubmissionSourceWave({
        project,
        source,
        snapshot: null,
        loadSource,
        sleep,
      }),
    ).resolves.toEqual({
      status: "blocked",
      failure: integrityFailure,
      attempts: 1,
    });
    expect(loadSource).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  },
);

test("normalizes thrown source reads as retryable availability failures", async () => {
  const loadSource = vi.fn(async () => {
    throw new Error("untrusted network detail");
  });

  await expect(
    loadRedditSubmissionSourceWave({
      project,
      source,
      snapshot: null,
      loadSource,
      sleep: async () => undefined,
    }),
  ).resolves.toEqual({
    status: "exhausted",
    failure: {
      status: "failed",
      reasonCode: "reddit-fetch-failed",
      message: "The Reddit source request failed.",
    },
    attempts: 3,
  });
  expect(loadSource).toHaveBeenCalledTimes(3);
});

test("normalizes invalid source results without exposing their contents", async () => {
  const loadSource = vi.fn(async () => ({
    status: "unexpected",
    text: "untrusted source text",
  }));

  await expect(
    loadRedditSubmissionSourceWave({
      project,
      source,
      snapshot: null,
      loadSource,
      sleep: async () => undefined,
    }),
  ).resolves.toEqual({
    status: "exhausted",
    failure: {
      status: "failed",
      reasonCode: "reddit-response-invalid",
      message: "The Reddit source response is invalid.",
    },
    attempts: 3,
  });
});
