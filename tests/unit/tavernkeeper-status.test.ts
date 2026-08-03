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
const historyUrl =
  "https://mentallyquill.github.io/TavernKeeper/reports/github/42/history/";
const snapshot = {
  provider: "github",
  source_health: "healthy",
  stale_since: null,
  repository: { id: 42, head_sha: currentSha },
};

function report(
  overrides: Partial<TavernKeeperPreferredReport> = {},
): TavernKeeperPreferredReport {
  return {
    report_id: "c".repeat(64),
    report_version: 1,
    supersedes_report_id: null,
    source_id: source.id,
    provider: "github",
    repository_id: source.repository_id,
    repository: source.repository,
    target_sha: currentSha,
    scanner_policy_version: "2",
    completed_at: "2026-07-31T12:05:00.000Z",
    result: "red",
    summary: {
      headline: "Reportable concerns detected",
      detail:
        "All required scanners completed at this commit and found 1 reportable high-severity concern.",
    },
    finding_counts: {
      reportable_severity: { critical: 0, high: 1, medium: 0 },
      severity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
    },
    report_url:
      "https://mentallyquill.github.io/TavernKeeper/reports/github/42/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/2/1/",
    history_url: historyUrl,
    ...overrides,
  };
}

describe("deriveTavernKeeperCardStatus", () => {
  test("keeps concerning results red and maps clean results by SHA freshness", () => {
    const currentConcerning = deriveTavernKeeperCardStatus({
      source,
      snapshot,
      preferredReports: [report()],
    });
    const staleConcerning = deriveTavernKeeperCardStatus({
      source,
      snapshot,
      preferredReports: [report({ target_sha: olderSha })],
    });
    const currentClean = deriveTavernKeeperCardStatus({
      source,
      snapshot,
      preferredReports: [report({ result: "teal" })],
    });
    const staleClean = deriveTavernKeeperCardStatus({
      source,
      snapshot,
      preferredReports: [report({ target_sha: olderSha, result: "teal" })],
    });

    expect(currentConcerning.state).toBe("red");
    expect(staleConcerning).toMatchObject({
      state: "red",
      reason: "outdated-concerning",
    });
    expect(currentClean.state).toBe("teal");
    expect(staleClean.state).toBe("orange");
  });

  test.each([
    {
      label: "unscanned",
      snapshot,
      reports: [],
      expected: { state: "gray", reason: "unscanned" },
    },
    {
      label: "unavailable prior red",
      snapshot: { ...snapshot, source_health: "unavailable" },
      reports: [report({ target_sha: olderSha })],
      expected: { state: "red", reason: "source-unavailable" },
    },
    {
      label: "unavailable prior teal",
      snapshot: { ...snapshot, source_health: "unavailable" },
      reports: [report({ target_sha: olderSha, result: "teal" })],
      expected: { state: "gray", reason: "source-unavailable" },
    },
  ])(
    "derives $label without trusting remote freshness",
    ({ snapshot: stateSnapshot, reports, expected }) => {
      expect(
        deriveTavernKeeperCardStatus({
          source,
          snapshot: stateSnapshot,
          preferredReports: reports,
        }),
      ).toMatchObject(expected);
    },
  );

  test("returns an explicit unsupported state for non-GitHub sources", () => {
    expect(
      deriveTavernKeeperCardStatus({
        source: { ...source, type: "codeberg" },
        snapshot,
        preferredReports: [report()],
      }),
    ).toEqual({
      state: "unsupported",
      reason: "unsupported",
      currentSha: null,
      report: null,
      history: [],
      historyUrl: null,
    });
  });

  test("matches report identity by repository ID, source ID, and canonical full name", () => {
    for (const mismatchedReport of [
      report({ repository_id: 99 }),
      report({ source_id: "github-99" }),
      report({ repository: "owner/other" }),
    ]) {
      expect(
        deriveTavernKeeperCardStatus({
          source,
          snapshot,
          preferredReports: [mismatchedReport],
        }),
      ).toMatchObject({ state: "gray", reason: "unscanned" });
    }
  });

  test("retains the newest report and history when source state is unavailable", () => {
    const newest = report({
      report_id: "e".repeat(64),
      target_sha: "e".repeat(40),
      completed_at: "2026-07-31T18:05:00.000Z",
      result: "teal",
    });
    expect(
      deriveTavernKeeperCardStatus({
        source,
        snapshot: { ...snapshot, stale_since: "2026-08-01T00:00:00.000Z" },
        preferredReports: [report({ target_sha: olderSha }), newest],
      }),
    ).toMatchObject({
      state: "gray",
      reason: "source-unavailable",
      currentSha: null,
      report: { reportId: newest.report_id, result: "teal" },
      historyUrl,
    });
  });

  test("selects the newest twelve conclusions oldest-left and preserves old red results", () => {
    const reports = Array.from({ length: 14 }, (_, index) => {
      const ordinal = index + 1;
      return report({
        report_id: ordinal.toString(16).padStart(64, "0"),
        target_sha: ordinal.toString(16).padStart(40, "0"),
        completed_at: `2026-07-${String(ordinal).padStart(2, "0")}T12:00:00.000Z`,
        result: ordinal === 3 ? "red" : "teal",
      });
    });
    const status = deriveTavernKeeperCardStatus({
      source,
      snapshot,
      preferredReports: reports,
    });

    expect(status?.history).toHaveLength(12);
    expect(status?.history.map(({ scannedSha }) => scannedSha)).toEqual(
      reports.slice(2).map(({ target_sha }) => target_sha),
    );
    expect(status?.history[0]).toMatchObject({ result: "red" });
    expect(status?.history.at(-1)).toMatchObject({ result: "teal" });
    expect(status?.historyUrl).toBe(historyUrl);
  });

  test("keeps only the newest superseding report for one SHA in compact history", () => {
    const sharedSha = "d".repeat(40);
    const original = report({
      report_id: "d".repeat(64),
      target_sha: sharedSha,
      result: "red",
    });
    const correction = report({
      report_id: "e".repeat(64),
      report_version: 2,
      supersedes_report_id: original.report_id,
      target_sha: sharedSha,
      completed_at: "2026-07-31T13:00:00.000Z",
      result: "teal",
      summary: {
        headline: "No reportable concerns detected",
        detail:
          "All required scanners completed at this commit, and no finding met TavernKeeper's reportable threshold.",
      },
      finding_counts: {
        reportable_severity: { critical: 0, high: 0, medium: 0 },
        severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      },
    });
    const status = deriveTavernKeeperCardStatus({
      source,
      snapshot,
      preferredReports: [original, correction],
    });

    expect(status.history).toEqual([
      expect.objectContaining({
        reportId: correction.report_id,
        result: "teal",
      }),
    ]);
    expect(status.history[0]).not.toHaveProperty("mode");
  });

  test("uses report ID to break ties between equivalent RFC3339 instants", () => {
    const winner = report({
      report_id: "e".repeat(64),
      target_sha: "d".repeat(40),
      completed_at: "2026-07-31T12:00:00-06:00",
      result: "teal",
    });
    const status = deriveTavernKeeperCardStatus({
      source,
      snapshot,
      preferredReports: [
        report({
          report_id: "b".repeat(64),
          target_sha: "c".repeat(40),
          completed_at: "2026-07-31T18:00:00.000Z",
        }),
        winner,
      ],
    });

    expect(status).toMatchObject({
      state: "orange",
      reason: "outdated-clean",
      report: { reportId: winner.report_id },
    });
  });

  test("ignores reports from inactive scanner policies", () => {
    expect(
      deriveTavernKeeperCardStatus({
        source,
        snapshot,
        preferredReports: [report({ scanner_policy_version: "1" })],
      }),
    ).toMatchObject({ state: "gray", reason: "unscanned" });
  });

  test("projects the deterministic summary without mode or model metadata", () => {
    const status = deriveTavernKeeperCardStatus({
      source,
      snapshot,
      preferredReports: [report()],
    });

    expect(status.report?.summary.detail).toContain(
      "1 reportable high-severity concern",
    );
    expect(status.report?.reportableSeverity).toEqual({
      critical: 0,
      high: 1,
      medium: 0,
    });
    expect(status.report).not.toHaveProperty("mode");
  });
});
