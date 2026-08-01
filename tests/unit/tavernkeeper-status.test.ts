import { describe, expect, test } from "vitest";

import {
  deriveTavernKeeperCardStatus,
  type TavernKeeperPreferredReport,
} from "@/features/catalog/tavernkeeper-status";

const source = {
  id: "github-42",
  type: "github",
  status: "active",
  repository: "owner/repo",
  repository_id: 42,
};
const currentSha = "a".repeat(40);
const olderSha = "b".repeat(40);
const snapshot = {
  provider: "github",
  source_health: "healthy",
  repository: { id: 42, head_sha: currentSha },
};

function report(
  overrides: Partial<TavernKeeperPreferredReport> = {},
): TavernKeeperPreferredReport {
  return {
    report_id: "c".repeat(64),
    source_id: source.id,
    provider: "github",
    repository_id: source.repository_id,
    repository: source.repository,
    target_sha: currentSha,
    scanner_policy_version: "1",
    completed_at: "2026-07-31T12:05:00.000Z",
    result: "yellow",
    finding_counts: {
      severity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
    },
    report_url: "https://mentallyquill.github.io/TavernKeeper/reports/example/",
    ...overrides,
  };
}

describe("deriveTavernKeeperCardStatus", () => {
  test("publishes a current result only for the exact healthy snapshot SHA", () => {
    expect(
      deriveTavernKeeperCardStatus({
        source,
        snapshot,
        preferredReports: [report({ result: "green" })],
      }),
    ).toMatchObject({
      state: "green",
      reason: "current",
      currentSha,
    });
  });

  test("keeps the newest older active-policy report gray when the SHA changed", () => {
    expect(
      deriveTavernKeeperCardStatus({
        source,
        snapshot,
        preferredReports: [report({ target_sha: olderSha })],
      }),
    ).toMatchObject({
      state: "gray",
      reason: "outdated",
      currentSha,
      report: expect.objectContaining({ scannedSha: olderSha }),
    });
  });

  test("retains the newest older active-policy report with a deterministic tie-break", () => {
    const latestReportId = "e".repeat(64);
    expect(
      deriveTavernKeeperCardStatus({
        source,
        snapshot,
        preferredReports: [
          report({
            report_id: "d".repeat(64),
            target_sha: "c".repeat(40),
            completed_at: "2026-07-30T12:05:00.000Z",
          }),
          report({
            report_id: "b".repeat(64),
            target_sha: "d".repeat(40),
            completed_at: "2026-07-31T12:05:00.000Z",
          }),
          report({
            report_id: latestReportId,
            target_sha: "e".repeat(40),
            completed_at: "2026-07-31T12:05:00.000Z",
          }),
        ],
      }),
    ).toMatchObject({
      state: "gray",
      reason: "outdated",
      report: { reportId: latestReportId, scannedSha: "e".repeat(40) },
    });
  });

  test("marks a confirmed SHA without a report as pending", () => {
    expect(
      deriveTavernKeeperCardStatus({
        source,
        snapshot,
        preferredReports: [],
      }),
    ).toEqual({
      state: "gray",
      reason: "pending",
      currentSha,
      report: null,
    });
  });

  test("does not publish a current result from an inactive scanner policy", () => {
    expect(
      deriveTavernKeeperCardStatus({
        source,
        snapshot,
        preferredReports: [report({ scanner_policy_version: "0" })],
      }),
    ).toEqual({
      state: "gray",
      reason: "pending",
      currentSha,
      report: null,
    });
  });

  test("does not trust reports when the local snapshot is unavailable", () => {
    expect(
      deriveTavernKeeperCardStatus({
        source,
        snapshot: { ...snapshot, source_health: "unavailable" },
        preferredReports: [report()],
      }),
    ).toEqual({
      state: "gray",
      reason: "source-unavailable",
      currentSha: null,
      report: null,
    });
  });

  test("does not trust a healthy snapshot retained after refresh became stale", () => {
    expect(
      deriveTavernKeeperCardStatus({
        source,
        snapshot: { ...snapshot, stale_since: "2026-08-01T00:00:00.000Z" },
        preferredReports: [report({ result: "green" })],
      }),
    ).toEqual({
      state: "gray",
      reason: "source-unavailable",
      currentSha: null,
      report: null,
    });
  });

  test("returns null for unsupported sources", () => {
    expect(
      deriveTavernKeeperCardStatus({
        source: { ...source, type: "codeberg" },
        snapshot,
        preferredReports: [report()],
      }),
    ).toBeNull();
  });
});
