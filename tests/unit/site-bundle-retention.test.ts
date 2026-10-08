import { expect, test } from "vitest";
import { planSiteBundleRetention } from "../../scripts/automation/site-bundle-retention.mjs";
function fixtures() {
  return Array.from({ length: 18 }, (_, index) => ({
    id: index + 1,
    sourceSha: "a".repeat(40),
    buildId: `run-${index + 1}-attempt-1`,
    confirmedAt: new Date(Date.UTC(2026, 9 - index, 8)).toISOString(),
    archiveDigest: `sha256:${"b".repeat(64)}`,
    runId: index + 1,
  }));
}
test("GitHub releases preserve three latest bundles and one verified bundle per month for twelve months", () => {
  const bundles = fixtures();
  bundles[1].confirmedAt = "2026-10-07T12:00:00.000Z";
  bundles[2].confirmedAt = "2026-10-06T12:00:00.000Z";
  const plan = planSiteBundleRetention({
    bundles,
    nowMs: Date.parse("2026-10-08T23:00:00.000Z"),
    protectedBundleIds: [18],
  });
  expect(plan.keepIds).toEqual(
    expect.arrayContaining([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18]),
  );
  expect(plan.removeIds).toEqual([13, 14, 15, 16, 17]);
});
test("malformed or future confirmation metadata cannot authorize pruning", () => {
  const bundles = fixtures();
  bundles[0].confirmedAt = "2099-01-01T00:00:00.000Z";
  expect(() =>
    planSiteBundleRetention({
      bundles,
      nowMs: Date.parse("2026-10-08T23:00:00.000Z"),
    }),
  ).toThrow();
});
