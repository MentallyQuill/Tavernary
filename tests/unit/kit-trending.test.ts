import { expect, test } from "vitest";

import {
  effectiveVoteAt,
  trendingScore,
  voteWeight,
} from "../../scripts/kits/trending.mjs";

test("uses a 30-day half-life", () => {
  const now = "2026-07-31T00:00:00.000Z";
  expect(voteWeight("2026-07-31T00:00:00.000Z", now)).toBeCloseTo(1);
  expect(voteWeight("2026-07-01T00:00:00.000Z", now)).toBeCloseTo(0.5);
  expect(
    trendingScore(
      ["2026-07-31T00:00:00.000Z", "2026-07-01T00:00:00.000Z"],
      now,
    ),
  ).toBeCloseTo(1.5);
});

test("ages pre-publication support from publication", () => {
  expect(
    effectiveVoteAt("2026-07-01T00:00:00.000Z", "2026-07-24T00:00:00.000Z"),
  ).toBe("2026-07-24T00:00:00.000Z");
});

test("does not produce future vote weights above one", () => {
  expect(
    voteWeight("2026-08-01T00:00:00.000Z", "2026-07-31T00:00:00.000Z"),
  ).toBe(1);
});
