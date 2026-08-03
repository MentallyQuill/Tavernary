import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  historyStaticParams,
  TavernKeeperAssessmentHistory,
} from "@/app/security/tavernkeeper/history/[sourceId]/page";
import type { TavernKeeperAssessedReport } from "@/features/catalog/tavernkeeper-status";

afterEach(() => cleanup());

function report(
  overrides: Partial<TavernKeeperAssessedReport> = {},
): TavernKeeperAssessedReport {
  return {
    report_id: "c".repeat(64),
    source_id: "github-42",
    provider: "github",
    repository_id: 42,
    repository: "owner/repo",
    target_sha: "a".repeat(40),
    scanner_policy_version: "3",
    contextual_review_policy_version: "1",
    completed_at: "2026-08-02T12:00:00.000Z",
    assessed_at: "2026-08-02T12:05:00.000Z",
    synthesis_policy_version: "1",
    synthesis_model: "gpt-5.6-luna",
    report_url: "https://example.test/reports/one/",
    history_url: "https://example.test/reports/history/",
    assessment: {
      risk_level: "low",
      headline: "Low concern",
      summary: "The reviewed behavior matches the extension's stated purpose.",
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

describe("TavernKeeper final-assessment history", () => {
  test("keeps the static-export route present before the first assessment", () => {
    expect(historyStaticParams([])).toEqual([{ sourceId: "unavailable" }]);
    expect(
      historyStaticParams([
        report(),
        report({ report_id: "e".repeat(64) }),
        report({ source_id: "github-99" }),
      ]),
    ).toEqual([{ sourceId: "github-42" }, { sourceId: "github-99" }]);
  });

  test("shows newest-first grades bound to exact SHA, model, policy, and technical report", () => {
    const older = report();
    const newer = report({
      report_id: "e".repeat(64),
      target_sha: "b".repeat(40),
      assessed_at: "2026-08-03T13:05:00.000Z",
      report_url: "https://example.test/reports/two/",
      assessment: {
        ...report().assessment,
        risk_level: "material",
        headline: "Material concern",
        summary: "One reviewed weakness could expose user-controlled data.",
        minor_cautions: 0,
        material_concerns: 1,
      },
    });

    render(
      <TavernKeeperAssessmentHistory
        sourceId="github-42"
        reports={[older, newer, report({ source_id: "github-99" })]}
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "TavernKeeper scan history for owner/repo",
      }),
    ).toBeInTheDocument();
    const entries = within(screen.getByRole("list")).getAllByRole("article");
    expect(entries).toHaveLength(2);
    expect(
      within(entries[0]).getByText("Material concern"),
    ).toBeInTheDocument();
    expect(entries[0]).toHaveTextContent(newer.assessment.summary);
    expect(entries[0]).toHaveTextContent("gpt-5.6-luna");
    expect(entries[0]).toHaveTextContent("Scanner policy 3");
    expect(entries[0]).toHaveTextContent("Synthesis policy 1");
    expect(
      within(entries[0]).getByRole("link", { name: /commit bbbbbbb/u }),
    ).toHaveAttribute(
      "href",
      `https://github.com/owner/repo/tree/${newer.target_sha}`,
    );
    expect(
      within(entries[0]).getByRole("link", {
        name: "View TavernKeeper technical report",
      }),
    ).toHaveAttribute("href", newer.report_url);
    expect(within(entries[1]).getByText("Low concern")).toBeInTheDocument();
  });

  test("explains when a requested source has no valid assessment history", () => {
    render(<TavernKeeperAssessmentHistory sourceId="github-42" reports={[]} />);

    expect(
      screen.getByText("No completed TavernKeeper assessments are available."),
    ).toBeInTheDocument();
  });
});
