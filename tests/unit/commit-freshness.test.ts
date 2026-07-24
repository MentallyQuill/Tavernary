import { expect, test } from "vitest";

import {
  commitFreshnessPercent,
  daysSince,
} from "@/features/catalog/commit-freshness";

const now = "2026-07-31T00:00:00Z";

test.each([
  ["2026-07-31T00:00:00Z", 100],
  ["2026-07-16T00:00:00Z", 50],
  ["2026-07-01T00:00:00Z", 0],
  ["2025-07-01T00:00:00Z", 0],
  [null, 0],
])("maps %s to %s percent freshness", (timestamp, expected) => {
  expect(commitFreshnessPercent(timestamp, now)).toBe(expected);
});

test("uses whole elapsed days", () => {
  expect(daysSince("2026-07-29T12:00:00Z", now)).toBe(1);
});
