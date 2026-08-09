import { describe, expect, test } from "vitest";

import {
  deriveTavernKeeperCardStatus,
  type TavernKeeperAssessedReport,
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
  stale_since: null,
  repository: { id: 42, head_sha: currentSha },
};

function report(
  overrides: Partial<TavernKeeperAssessedReport> = {},
): TavernKeeperAssessedReport {
  return {
    report_id: "c".repeat(64),
    source_id: source.id,
    provider: "github",
    repository_id: source.repository_id,
    repository: source.repository,
    target_sha: currentSha,
    scanner_policy_version: "4",
    contextual_review_policy_version: "1",
    completed_at: "2026-07-31T12:05:00.000Z",
    assessed_at: "2026-07-31T12:06:00.000Z",
    synthesis_policy_version: "1",
    synthesis_model: "gpt-5.6-luna",
    danger_basis: "none",
    assessment_source: "model",
    report_url:
      "https://mentallyquill.github.io/TavernKeeper/reports/github/42/" +
      `${currentSha}/4/${"c".repeat(64)}/`,
    assessment: {
      risk_level: "low",
      headline: "Low concern",
      summary:
        "The reviewed behavior matches the extension's purpose, with one minor hardening caution.",
      minor_cautions: 1,
      material_concerns: 0,
      high_danger: 0,
      malicious_evidence: "No evidence of malicious behavior was identified.",
      cited_finding_ids: ["d".repeat(64)],
      interaction_chains: [],
    },
    ...overrides,
  };
}

function derive(
  assessedReport: TavernKeeperAssessedReport | null,
  stateSnapshot = snapshot,
) {
  return deriveTavernKeeperCardStatus({
    source,
    snapshot: stateSnapshot,
    assessedReports: assessedReport ? [assessedReport] : [],
    preferredReportIds: assessedReport ? [assessedReport.report_id] : [],
  });
}

describe("deriveTavernKeeperCardStatus", () => {
  test("keeps risk color independent from current or stale freshness", () => {
    expect(derive(report())).toMatchObject({
      state: "teal",
      riskLevel: "low",
      freshness: "current",
    });
    expect(derive(report({ target_sha: olderSha }))).toMatchObject({
      state: "teal",
      riskLevel: "low",
      freshness: "stale",
    });
    expect(
      derive(
        report({
          target_sha: olderSha,
          assessment: {
            ...report().assessment,
            risk_level: "material",
            headline: "Material concern",
            minor_cautions: 0,
            material_concerns: 1,
          },
        }),
      ),
    ).toMatchObject({
      state: "orange",
      riskLevel: "material",
      freshness: "stale",
    });
    expect(
      derive(
        report({
          target_sha: olderSha,
          danger_basis: "malicious_or_compromised",
          assessment: {
            ...report().assessment,
            risk_level: "high",
            headline: "Immediate danger",
            minor_cautions: 0,
            high_danger: 1,
            malicious_evidence: "The review found credible malicious behavior.",
          },
        }),
      ),
    ).toMatchObject({
      state: "red",
      riskLevel: "high",
      freshness: "stale",
      report: { dangerBasis: "malicious_or_compromised" },
    });
  });

  test("uses gray only when no prior assessment is available", () => {
    expect(derive(null)).toMatchObject({
      state: "gray",
      riskLevel: null,
      freshness: "unassessed",
    });
    expect(
      derive(report(), { ...snapshot, source_health: "unavailable" }),
    ).toMatchObject({
      state: "teal",
      riskLevel: "low",
      freshness: "unavailable",
    });
    expect(
      derive(null, { ...snapshot, source_health: "unavailable" }),
    ).toMatchObject({
      state: "gray",
      riskLevel: null,
      freshness: "unavailable",
    });
  });

  test("returns the super-dark unsupported state for non-GitHub sources", () => {
    expect(
      deriveTavernKeeperCardStatus({
        source: { ...source, type: "codeberg" },
        snapshot,
        assessedReports: [report()],
        preferredReportIds: [report().report_id],
      }),
    ).toEqual({
      state: "unsupported",
      riskLevel: null,
      freshness: "unsupported",
      currentSha: null,
      report: null,
      history: [],
      historyUrl: null,
    });
  });

  test("matches report identity and the active scanner policy", () => {
    for (const mismatched of [
      report({ repository_id: 99 }),
      report({ source_id: "github-99" }),
      report({ repository: "owner/other" }),
      report({ scanner_policy_version: "2" }),
    ]) {
      expect(
        deriveTavernKeeperCardStatus({
          source,
          snapshot,
          assessedReports: [mismatched],
          preferredReportIds: [mismatched.report_id],
        }),
      ).toMatchObject({ state: "gray", riskLevel: null });
    }
  });

  test("keeps supported policy-3 danger visible as a stale fallback", () => {
    const historical = report({
      scanner_policy_version: "3",
      danger_basis: "malicious_or_compromised",
      report_url: report().report_url.replace("/4/", "/3/"),
      assessment: {
        ...report().assessment,
        risk_level: "high",
        headline: "Immediate danger",
        high_danger: 1,
        malicious_evidence: "Credible malicious behavior was identified.",
      },
    });

    expect(
      deriveTavernKeeperCardStatus({
        source,
        snapshot,
        assessedReports: [historical],
        preferredReportIds: [historical.report_id],
      }),
    ).toMatchObject({
      state: "red",
      riskLevel: "high",
      freshness: "stale",
      report: { scannerPolicyVersion: "3" },
      history: [expect.objectContaining({ scannerPolicyVersion: "3" })],
    });
  });

  test("uses the explicit preferred report while retaining every final assessment in history", () => {
    const original = report({
      report_id: "d".repeat(64),
      target_sha: olderSha,
      assessed_at: "2026-07-31T12:06:00.000Z",
      danger_basis: "critical_exploitable_vulnerability",
      assessment: { ...report().assessment, risk_level: "high" },
    });
    const correction = report({
      report_id: "e".repeat(64),
      target_sha: olderSha,
      assessed_at: "2026-07-31T13:06:00.000Z",
    });
    const status = deriveTavernKeeperCardStatus({
      source,
      snapshot,
      assessedReports: [original, correction],
      preferredReportIds: [correction.report_id],
    });

    expect(status.report?.reportId).toBe(correction.report_id);
    expect(status.history.map(({ reportId }) => reportId)).toEqual([
      original.report_id,
      correction.report_id,
    ]);
    expect(status.historyUrl).toBe("/security/tavernkeeper/history/github-42/");
  });

  test("selects the newest twelve final assessments oldest-left", () => {
    const reports = Array.from({ length: 14 }, (_, index) =>
      report({
        report_id: (index + 1).toString(16).padStart(64, "0"),
        target_sha: (index + 1).toString(16).padStart(40, "0"),
        assessed_at: `2026-07-${String(index + 1).padStart(2, "0")}T12:06:00.000Z`,
      }),
    );
    const status = deriveTavernKeeperCardStatus({
      source,
      snapshot,
      assessedReports: reports,
      preferredReportIds: [reports.at(-1)!.report_id],
    });

    expect(status.history).toHaveLength(12);
    expect(status.history.map(({ reportId }) => reportId)).toEqual(
      reports.slice(2).map(({ report_id }) => report_id),
    );
  });

  test("projects the concise final assessment without technical findings", () => {
    const status = derive(report());

    expect(status.report).toMatchObject({
      riskLevel: "low",
      headline: "Low concern",
      minorCautions: 1,
      materialConcerns: 0,
      highDanger: 0,
      dangerBasis: "none",
      assessmentSource: "model",
      synthesisModel: "gpt-5.6-luna",
      treeUrl: `https://github.com/owner/repo/tree/${currentSha}`,
    });
    expect(status.report).not.toHaveProperty("commitUrl");
    expect(status.report).not.toHaveProperty("candidates");
    expect(status.report).not.toHaveProperty("assessments");
  });
});
