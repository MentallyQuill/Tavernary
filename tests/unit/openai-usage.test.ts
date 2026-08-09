import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import {
  aggregateOpenAiUsage,
  completedUtcMonth,
  refreshOpenAiUsage,
} from "../../scripts/support/openai-usage.mjs";

const period = {
  start: "2026-07-01T00:00:00.000Z",
  end: "2026-08-01T00:00:00.000Z",
};

test("aggregates paginated completion usage and invoice costs", () => {
  const record = aggregateOpenAiUsage({
    period,
    generatedAt: "2026-08-02T07:00:00.000Z",
    usagePages: [
      {
        object: "page",
        data: [
          {
            object: "bucket",
            start_time: 1,
            end_time: 2,
            results: [
              {
                object: "organization.usage.completions.result",
                input_tokens: 30_000_000,
                input_cached_tokens: 4_000_000,
                output_tokens: 3_000_000,
                num_model_requests: 2_500,
                project_id: "proj_tavernary",
              },
            ],
          },
        ],
        has_more: true,
        next_page: "usage-page-2",
      },
      {
        object: "page",
        data: [
          {
            object: "bucket",
            start_time: 2,
            end_time: 3,
            results: [
              {
                object: "organization.usage.completions.result",
                input_tokens: 10_500_000,
                input_cached_tokens: 1_000_000,
                output_tokens: 1_500_000,
                num_model_requests: 1_500,
                project_id: "proj_tavernary",
              },
            ],
          },
        ],
        has_more: false,
        next_page: null,
      },
    ],
    costPages: [
      {
        object: "page",
        data: [
          {
            object: "bucket",
            start_time: 1,
            end_time: 2,
            results: [
              {
                object: "organization.costs.result",
                amount: { value: 8.1, currency: "usd" },
                project_id: "proj_tavernary",
              },
              {
                object: "organization.costs.result",
                amount: { value: 5.4, currency: "usd" },
                project_id: "proj_tavernary",
              },
            ],
          },
        ],
        has_more: false,
        next_page: null,
      },
    ],
  });

  expect(record).toEqual({
    kind: "measured",
    periodStart: period.start,
    periodEnd: period.end,
    generatedAt: "2026-08-02T07:00:00.000Z",
    inputTokens: 40_500_000,
    cachedInputTokens: 5_000_000,
    outputTokens: 4_500_000,
    requests: 4_000,
    costUsd: 13.5,
    currency: "usd",
  });
});

test("derives the prior completed UTC calendar month", () => {
  expect(completedUtcMonth(new Date("2026-08-09T18:30:00-06:00"))).toEqual({
    start: "2026-07-01T00:00:00.000Z",
    end: "2026-08-01T00:00:00.000Z",
  });
});

test.each([
  ["missing project scope", { OPENAI_ADMIN_KEY: "secret" }],
  ["missing admin key", { OPENAI_PROJECT_ID: "proj_tavernary" }],
])("fails closed for %s", async (_name, env) => {
  await expect(
    refreshOpenAiUsage({
      fetch: vi.fn(),
      env,
      now: new Date("2026-08-09T00:00:00Z"),
      outputPath: "unused.json",
    }),
  ).rejects.toThrow(/OPENAI_(?:ADMIN_KEY|PROJECT_ID)/u);
});

test("publishes only aggregate fields for the selected project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tavernary-support-"));
  const outputPath = join(directory, "monthly-usage.json");
  const responses = [
    {
      object: "page",
      data: [
        {
          object: "bucket",
          start_time: 1,
          end_time: 2,
          results: [
            {
              object: "organization.usage.completions.result",
              input_tokens: 100,
              input_cached_tokens: 20,
              output_tokens: 10,
              num_model_requests: 2,
              project_id: "proj_tavernary",
              model: "gpt-5.6-luna",
              api_key_id: "key_private",
            },
          ],
        },
      ],
      has_more: false,
      next_page: null,
    },
    {
      object: "page",
      data: [
        {
          object: "bucket",
          start_time: 1,
          end_time: 2,
          results: [
            {
              object: "organization.costs.result",
              amount: { value: 0.25, currency: "usd" },
              project_id: "proj_tavernary",
              line_item: "Model usage",
            },
          ],
        },
      ],
      has_more: false,
      next_page: null,
    },
  ];
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(responses.shift()), { status: 200 }),
  );

  await refreshOpenAiUsage({
    fetch,
    env: {
      OPENAI_ADMIN_KEY: "admin-secret",
      OPENAI_PROJECT_ID: "proj_tavernary",
    },
    now: new Date("2026-08-09T00:00:00Z"),
    outputPath,
  });

  const written = await readFile(outputPath, "utf8");
  expect(JSON.parse(written)).toEqual({
    schemaVersion: 1,
    records: [
      {
        kind: "measured",
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEnd: "2026-08-01T00:00:00.000Z",
        generatedAt: "2026-08-09T00:00:00.000Z",
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 10,
        requests: 2,
        costUsd: 0.25,
        currency: "usd",
      },
    ],
  });
  expect(written).not.toContain("admin-secret");
  expect(written).not.toContain("proj_tavernary");
  expect(written).not.toContain("key_private");
});
