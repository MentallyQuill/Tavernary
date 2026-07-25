import { expect, test } from "vitest";

import { selectRandomCanaryIds } from "../../scripts/catalog/select-enrichment-canary.mjs";

function record(
  id: string,
  overrides: Record<string, unknown> = {},
): { id: string } & Record<string, unknown> {
  return {
    id,
    visibility: "published",
    metadata_status: "provisional",
    summary: "An extension for SillyTavern.",
    refresh_policy: "automatic",
    source: {
      type: "github",
      repository: `owner/${id}`,
      repository_id: null,
    },
    ...overrides,
  };
}

test("selects five unique random IDs from refreshable enrichment records", () => {
  const records = [
    ...Array.from({ length: 7 }, (_, index) => record(`eligible-${index}`)),
    record("manual", { refresh_policy: "manual" }),
    record("hidden", { visibility: "hidden" }),
    record("curated", {
      metadata_status: "curated",
      summary: "A complete editorial description.",
    }),
    record("external", { source: { type: "url" } }),
  ];
  const draws = [6, 0, 4, 1, 2];

  const selected = selectRandomCanaryIds(records, {
    randomInt: (maximum) => draws.shift()! % maximum,
  });

  expect(selected).toHaveLength(5);
  expect(new Set(selected).size).toBe(5);
  expect(selected.every((id) => id.startsWith("eligible-"))).toBe(true);
});

test("fails clearly when fewer than five candidates are available", () => {
  expect(() =>
    selectRandomCanaryIds(
      Array.from({ length: 4 }, (_, index) => record(`eligible-${index}`)),
    ),
  ).toThrow("at least five");
});
