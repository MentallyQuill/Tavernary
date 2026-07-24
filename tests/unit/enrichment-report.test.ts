import { expect, test } from "vitest";

import { createEnrichmentReport } from "../../scripts/catalog/enrichment-report.mjs";

test("creates deterministic enrichment counts and IDs", () => {
  expect(
    createEnrichmentReport("2026-07-24T00:00:00.000Z", {
      enriched: ["b", "a"],
      fallback: ["c"],
      skipped: ["d"],
      failed: [{ id: "e", reason: "provider offline" }],
    }),
  ).toEqual({
    generated_at: "2026-07-24T00:00:00.000Z",
    selected: 5,
    enriched: ["a", "b"],
    fallback: ["c"],
    skipped: ["d"],
    failed: [{ id: "e", reason: "provider offline" }],
  });
});

test("rejects contradictory duplicate outcome IDs", () => {
  expect(() =>
    createEnrichmentReport("2026-07-24T00:00:00.000Z", {
      enriched: ["same"],
      fallback: ["same"],
      skipped: [],
      failed: [],
    }),
  ).toThrow("duplicate project IDs");
});
