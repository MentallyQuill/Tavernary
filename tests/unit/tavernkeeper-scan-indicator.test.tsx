import { readFileSync } from "node:fs";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import postcss, { type AtRule, type Rule } from "postcss";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TavernKeeperScanIndicator } from "@/features/catalog/components/tavernkeeper-scan-indicator";
import type {
  TavernKeeperCardStatus,
  TavernKeeperReportSummary,
} from "@/features/catalog/tavernkeeper-status";

function scanReport(
  overrides: Partial<TavernKeeperReportSummary> = {},
): TavernKeeperReportSummary {
  return {
    reportId: "report-1",
    riskLevel: "high",
    headline: "Immediate danger",
    dangerBasis: "malicious_or_compromised",
    assessmentSource: "model",
    summary:
      "The combined reviewed behavior could expose credentials to an untrusted endpoint.",
    minorCautions: 1,
    materialConcerns: 2,
    highDanger: 1,
    maliciousEvidence:
      "The review found evidence consistent with credential theft.",
    citedFindingIds: ["a".repeat(64)],
    scannedSha: "abc1234def5678abc1234def5678abc1234def5678",
    treeUrl:
      "https://github.com/owner/repository/tree/abc1234def5678abc1234def5678abc1234def5678",
    scannedAt: "2026-07-31T12:00:00.000Z",
    assessedAt: "2026-07-31T12:05:00.000Z",
    scannerPolicyVersion: "2",
    contextualReviewPolicyVersion: "1",
    synthesisPolicyVersion: "1",
    synthesisModel: "gpt-5.6-luna",
    reportUrl: "https://example.test/reports/directive",
    technicalHistoryUrl: "https://example.test/reports/directive/history",
    ...overrides,
    javascriptAnalysisStatus:
      overrides.javascriptAnalysisStatus ?? "complete",
  };
}

const redReport = scanReport();
const redStatus: TavernKeeperCardStatus = {
  state: "red",
  riskLevel: "high",
  freshness: "current",
  currentSha: "abc1234def5678abc1234def5678abc1234def5678",
  report: redReport,
  history: [redReport],
  historyUrl: "/security/tavernkeeper/history/github-42/",
};

const tealReport = scanReport({
  riskLevel: "low",
  dangerBasis: "none",
  headline: "Low concern",
  summary:
    "The reviewed behavior matches the extension's stated purpose, with no material concerns.",
  minorCautions: 0,
  materialConcerns: 0,
  highDanger: 0,
  maliciousEvidence: "No evidence of malicious behavior was identified.",
  citedFindingIds: [],
});
const tealStatus: TavernKeeperCardStatus = {
  ...redStatus,
  state: "teal",
  riskLevel: "low",
  report: tealReport,
  history: [tealReport],
};

const pendingStatus: TavernKeeperCardStatus = {
  state: "gray",
  riskLevel: null,
  freshness: "unassessed",
  currentSha: "abc1234def5678abc1234def5678abc1234def5678",
  report: null,
  history: [],
  historyUrl: null,
};

const unsupportedStatus: TavernKeeperCardStatus = {
  state: "unsupported",
  riskLevel: null,
  freshness: "unsupported",
  currentSha: null,
  report: null,
  history: [],
  historyUrl: null,
};

function rectangle(left: number, top: number, width: number, height: number) {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  } as DOMRect;
}

describe("TavernKeeperScanIndicator", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("renders the compact advisory card with an exact commit link", () => {
    const { container } = render(
      <TavernKeeperScanIndicator projectId="directive" status={redStatus} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /TavernKeeper scan: Immediate danger; current/u,
      }),
    );

    const panel = screen.getByRole("dialog", {
      name: "TavernKeeper Scan Results",
    });
    expect(panel).toHaveTextContent("Immediate danger");
    expect(panel).toHaveTextContent("Danger basis");
    expect(panel).toHaveTextContent(
      "Credible malicious or compromised behavior",
    );
    expect(panel).toHaveTextContent("current");
    expect(panel).toHaveTextContent(redReport.summary);
    expect(panel).toHaveTextContent("1 minor caution");
    expect(panel).toHaveTextContent("2 material concerns");
    expect(panel).toHaveTextContent("1 high-danger finding");
    expect(panel).not.toHaveTextContent(redReport.maliciousEvidence);
    const sourceTreeLink = within(panel).getByRole("link", {
      name: `Browse scanned source at commit ${redReport.scannedSha} on GitHub`,
    });
    expect(sourceTreeLink).toHaveTextContent(redReport.scannedSha.slice(0, 7));
    expect(sourceTreeLink).toHaveAttribute("href", redReport.treeUrl);
    expect(sourceTreeLink).toHaveAttribute("target", "_blank");
    expect(sourceTreeLink).toHaveAttribute(
      "rel",
      expect.stringContaining("noopener"),
    );
    expect(
      within(panel).getByRole("link", { name: "View full report" }),
    ).toHaveAttribute("href", redStatus.report?.reportUrl);
    expect(
      within(panel).getByRole("link", { name: "View scan history" }),
    ).toHaveAttribute("href", redStatus.historyUrl?.replace(/\/$/u, ""));
    expect(
      within(panel).queryByRole("group", {
        name: "Recent TavernKeeper scan history",
      }),
    ).not.toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /Gitleaks|OpenGrep|policy|coverage|excluded/u,
    );
    expect(panel).not.toHaveTextContent(
      /\b(?:safe|trusted|verified|protected|certified)\b/iu,
    );
    expect(
      container.querySelector('svg[data-icon="scan-fill"]'),
    ).toBeInTheDocument();
  });

  test("distinguishes vulnerability danger from malicious behavior", () => {
    const report = scanReport({
      dangerBasis: "critical_exploitable_vulnerability",
      maliciousEvidence:
        "No credible malicious behavior was identified; the danger is an exploitable vulnerability.",
    });
    render(
      <TavernKeeperScanIndicator
        projectId="vulnerability-danger"
        status={{ ...redStatus, report, history: [report] }}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    const panel = screen.getByRole("dialog");
    expect(panel).toHaveTextContent(
      "Critical, readily exploitable vulnerability",
    );
    expect(panel).not.toHaveTextContent(
      "Credible malicious or compromised behavior",
    );
  });

  test.each([
    {
      expected:
        "The project is assessed as low risk. Its test workflow could use tighter token handling, narrower permissions, and pinned action versions.",
      summary:
        "The project is assessed as low risk. Its test workflow could use tighter token handling, narrower permissions, and pinned action versions (V5 findings 72484c6e8e8d51696e42a5038b454c513da346f79ef557f0c24db3eefd2e68f3, 7e6ec8fb70e2a68052c34a3d7d7b1a8b011698553c48df62ec39943af8ee0bbd, 817962172966e2e2adae88040c785386dcfaeb3717f1feb8d7b5f1be23d08f6c, and cef063e24672a717652b8ac33af23d6a04d1009c2bd06f733f5d6d8e9e5015cb). A known issue was also found in a development-only helper dependency and does \u200b\u200b",
    },
    {
      expected:
        "The project has a material vulnerability: when normal JSON parsing fails, it may execute the AI's response as JavaScript. A manipulated or malicious AI response could therefore run code inside the user's SillyTavern session. Users should avoid untrusted AI endpoints or content until this fallback is removed and replaced with safe, non-executing JSON repair.",
      summary:
        "The project has a material vulnerability: when normal JSON parsing fails, it may execute the AI's response as JavaScript. A manipulated or malicious AI response could therefore run code inside the user's SillyTavern session. Users should avoid untrusted AI endpoints or content until this fallback is removed and replaced with safe, non-executing JSON repair. \uE200cite\uE202e1f6254c527f8d5fd529e09c3c7959fa59e8afbbbabfa395a3ce291339df0ba6\uE201",
    },
    {
      expected:
        "The project is assessed as low risk for users. Its test workflow could use safer GitHub token handling, narrower permissions, and pinned action versions.",
      summary:
        "The project is assessed as low risk for users. Its test workflow could use safer GitHub token handling, narrower permissions, and pinned action versions [72484c6e8e8d51696e42a5038b454c513da346f79ef557f0c24db3eefd2e68f3] [7e6ec8fb70e2a68052c34a3d7d7b1a8b011698553c48df62ec39943af8ee0bbd] [817962172966e2e2adae88040c785386dcfaeb3717f1feb8d7b5f1be23d08f6c] [cef063e24672a717652b8ac33af23d6a04d1009c2bd06f733f5d6d8e9e5015cb]. A known issue also affects a developer testing/build tool, not the installed S",
    },
    {
      expected:
        "The eight material findings are known vulnerabilities in dependencies used by the project's test tooling, not in the installed VectFox extension, so direct user impact is unlikely.",
      summary:
        "The eight material findings are known vulnerabilities in dependencies used by the project's test tooling, not in the installed VectFox extension, so direct user impact is unlikely [0397056563b1b7873056136a413c67c2a2d3235db1db74ea738dba1d83819202,09be780f6d03ede2c2fe1a97bb9f8682f1662fa9883ba73242a46050450c0391,53076ef905302530238a497417d76b71218ce2485bfe8be5990c2fd9f0da774c,66f3348967d97ad1ac6aefe40446c9cf2b2f7304a491c1bc8922a9d6d585b66d,7a9b663e3b6cf212d742ee2e39d66445d38ad46d311be1fb5506c885896",
    },
    {
      expected: "The validated evidence supports a low-risk assessment.",
      summary:
        "The validated evidence supports a low-risk assessment. Findings: 0b57f46e6a48a2af0fd147370c4d36cad8be2bb73f629c751f7c54b0bb8b04a3, 14a66334365238113c6ae7edc276bf763ada97c62141b3ea60a7125543bbff4c",
    },
    {
      expected:
        "The project uses vulnerable production dependencies, including one medium-severity issue and one high-severity issue.",
      summary:
        "The project uses vulnerable production dependencies, including one medium-severity issue (28ee3138d3d8994ad41b170ee691b8035a20cb6b3f8d6d3272d972131596b848) and one high-severity issue (986f02e9c6e58bd1f45358afa192618ec56d1e1fc097b14effc22a5c2597abcc).",
    },
    {
      expected: "No credible malicious behavior was validated.",
      summary:
        "No credible malicious behavior was validated.【010d9a8ee67bb15dcce292d009f91ddacfb62dda24d9b017f6d794f02fc5dd】【0a5120939b9cfe9a1fd05017621d304bd9ba97d4552b789d95b5f8b15bed413】",
    },
  ])(
    "keeps internal finding references out of concise assessment copy",
    ({ expected, summary }) => {
      const report = scanReport({ summary });
      render(
        <TavernKeeperScanIndicator
          projectId="internal-finding-reference"
          status={{ ...redStatus, report, history: [report] }}
        />,
      );

      fireEvent.click(screen.getByRole("button"));

      const conciseSummary = screen
        .getByRole("dialog")
        .querySelector(".tavernkeeper-summary");
      expect(conciseSummary).toHaveTextContent(expected);
      expect(conciseSummary).not.toHaveTextContent(/[0-9a-f]{64}/iu);
      expect(conciseSummary).not.toHaveTextContent(/cite/iu);
      expect(report.summary).toBe(summary);
    },
  );

  test.each([
    [tealStatus, tealReport.summary],
    [
      {
        ...tealStatus,
        freshness: "stale",
      } satisfies TavernKeeperCardStatus,
      `${tealReport.summary} This assessment covers an older commit. An updated scan is pending.`,
    ],
    [pendingStatus, "This project hasn't been scanned by TavernKeeper."],
    [
      unsupportedStatus,
      "TavernKeeper scanning is not supported for this project's source.",
    ],
  ])(
    "uses approved concise copy without certification language",
    (status, copy) => {
      render(
        <TavernKeeperScanIndicator projectId="copy-check" status={status} />,
      );
      fireEvent.click(screen.getByRole("button"));

      const panel = screen.getByRole("dialog");
      expect(panel).toHaveTextContent(copy);
      expect(panel).not.toHaveTextContent(
        /\b(?:safe|trusted|verified|protected|certified)\b/iu,
      );
    },
  );

  test("keeps stale risk color and uses the supplied clock SVG", () => {
    render(
      <TavernKeeperScanIndicator
        projectId="stale-low"
        status={{ ...tealStatus, freshness: "stale" }}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "TavernKeeper scan: Low concern; stale assessment.",
    });
    expect(trigger).toHaveClass("tavernkeeper-scan-indicator-teal");
    const clock = trigger.querySelector(
      'svg.tavernkeeper-freshness-clock[data-icon="clock"]',
    );
    expect(clock).toBeInTheDocument();
    expect(clock?.querySelector("path")).toHaveAttribute(
      "d",
      "M12 7V12L14.5 13.5M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z",
    );
  });

  test("shows labeled history only when it communicates a trend", () => {
    const prior = scanReport({
      reportId: "report-prior",
      riskLevel: "material",
      reportUrl: "https://example.test/reports/prior",
      assessedAt: "2026-07-30T12:05:00.000Z",
    });
    render(
      <TavernKeeperScanIndicator
        projectId="history-threshold"
        status={{ ...tealStatus, history: [prior, tealReport] }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Recent scans")).toBeInTheDocument();
    expect(
      screen.getAllByRole("img", {
        name: /TavernKeeper scan history:/u,
      }),
    ).toHaveLength(2);
  });

  test("renders the newest twelve history conclusions oldest-left with accessible identity", () => {
    const history = Array.from({ length: 13 }, (_, index) =>
      scanReport({
        reportId: `report-${index + 1}`,
        riskLevel: index === 1 ? "high" : "low",
        scannedSha: (index + 1).toString(16).padStart(40, "0"),
        scannedAt: `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
        assessedAt: `2026-07-${String(index + 1).padStart(2, "0")}T12:05:00.000Z`,
        scannerPolicyVersion: "policy-1",
      }),
    );
    render(
      <TavernKeeperScanIndicator
        projectId="history"
        status={{ ...tealStatus, report: history.at(-1)!, history }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    const blocks = screen.getAllByRole("img", {
      name: /TavernKeeper scan history:/u,
    });
    expect(blocks).toHaveLength(12);
    expect(blocks[0]).toHaveAccessibleName(
      "TavernKeeper scan history: immediate danger on July 2, 2026 at commit 0000000 under policy policy-1",
    );
    expect(blocks.at(-1)).toHaveAccessibleName(
      "TavernKeeper scan history: low concern on July 13, 2026 at commit 0000000 under policy policy-1",
    );
    expect(blocks[0]).toHaveClass("tavernkeeper-history-high");
    expect(
      screen.getAllByRole("link", {
        name: /Open TavernKeeper report for/u,
      }),
    ).toHaveLength(12);
  });

  test("shows zero concern counts without technical scanner rows", () => {
    render(
      <TavernKeeperScanIndicator projectId="directive" status={tealStatus} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /TavernKeeper scan: Low concern; current/u,
      }),
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(tealReport.summary);
    expect(
      document.querySelector(".tavernkeeper-assessment-counts"),
    ).toHaveTextContent("0 minor cautions");
  });

  test("keeps the popover open while the pointer moves from trigger to panel", () => {
    vi.useFakeTimers();
    render(
      <TavernKeeperScanIndicator projectId="directive" status={redStatus} />,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: Immediate danger; current/u,
    });
    fireEvent.pointerEnter(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.pointerLeave(trigger);
    fireEvent.pointerEnter(screen.getByRole("dialog"));
    vi.advanceTimersByTime(150);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("opens for mouse hover but ignores touch pointer entry", () => {
    render(
      <TavernKeeperScanIndicator projectId="directive" status={redStatus} />,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: Immediate danger; current/u,
    });
    fireEvent.pointerEnter(trigger, { pointerType: "touch" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("closes 150 milliseconds after the pointer exits", () => {
    vi.useFakeTimers();
    render(
      <TavernKeeperScanIndicator projectId="directive" status={redStatus} />,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: Immediate danger; current/u,
    });
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerLeave(trigger);
    act(() => vi.advanceTimersByTime(149));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("clamps the popover within the viewport margin and repositions on resize and scroll", () => {
    let triggerRect = rectangle(0, 0, 18, 18);
    let panelRect = rectangle(0, 0, 390, 100);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(400);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(700);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("tavernkeeper-popover")
          ? panelRect
          : triggerRect;
      },
    );

    render(
      <TavernKeeperScanIndicator projectId="directive" status={redStatus} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /TavernKeeper scan: Immediate danger; current/u,
      }),
    );
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveStyle({ left: "8px", top: "26px" });

    panelRect = rectangle(0, 0, 200, 100);
    triggerRect = rectangle(200, 500, 20, 20);
    fireEvent.resize(window);
    expect(panel).toHaveStyle({ left: "110px", top: "392px" });

    triggerRect = rectangle(300, 600, 20, 20);
    fireEvent.scroll(window);
    expect(panel).toHaveStyle({ left: "192px", top: "492px" });
  });

  test("keeps the popover open while focus moves within it and closes on focus exit", () => {
    render(
      <TavernKeeperScanIndicator projectId="directive" status={redStatus} />,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: Immediate danger; current/u,
    });
    fireEvent.focus(trigger);
    const panel = screen.getByRole("dialog");
    const reportLink = within(panel).getByRole("link", {
      name: "View full report",
    });
    fireEvent.blur(trigger, { relatedTarget: reportLink });
    fireEvent.focus(reportLink);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.blur(reportLink, { relatedTarget: document.body });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("uses a non-modal Tab route through card links without trapping linkless panels", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <TavernKeeperScanIndicator projectId="directive" status={redStatus} />
        <button type="button">Outside app control</button>
      </>,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: Immediate danger; current/u,
    });
    await user.tab();
    expect(trigger).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole("link", {
        name: `Browse scanned source at commit ${redReport.scannedSha} on GitHub`,
      }),
    ).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole("link", { name: "View full report" }),
    ).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole("link", { name: "View scan history" }),
    ).toHaveFocus();

    await user.tab({ shift: true });
    expect(
      screen.getByRole("link", { name: "View full report" }),
    ).toHaveFocus();

    await user.tab({ shift: true });
    expect(
      screen.getByRole("link", {
        name: `Browse scanned source at commit ${redReport.scannedSha} on GitHub`,
      }),
    ).toHaveFocus();

    await user.tab({ shift: true });
    expect(trigger).toHaveFocus();

    rerender(
      <>
        <TavernKeeperScanIndicator projectId="pending" status={pendingStatus} />
        <button type="button">Outside app control</button>
      </>,
    );
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Outside app control" }),
    ).toHaveFocus();
  });

  test("adds no closed-state document listeners, portals, tooltips, or history bodies per card", () => {
    const addDocumentListener = vi.spyOn(document, "addEventListener");
    const { container } = render(
      <>
        {Array.from({ length: 100 }, (_, index) => (
          <TavernKeeperScanIndicator
            key={index}
            projectId={`closed-${index}`}
            status={redStatus}
          />
        ))}
      </>,
    );

    expect(container.querySelectorAll(".tavernkeeper-popover")).toHaveLength(0);
    expect(
      container.querySelectorAll(".tavernkeeper-history-strip"),
    ).toHaveLength(0);
    expect(container.querySelectorAll(".tooltip-anchor")).toHaveLength(0);
    expect(
      container.querySelectorAll('svg[data-icon="scan-fill"]'),
    ).toHaveLength(100);
    for (const trigger of container.querySelectorAll(
      ".tavernkeeper-scan-indicator-trigger",
    )) {
      expect(trigger.querySelectorAll("*").length).toBeLessThanOrEqual(2);
    }
    expect(
      addDocumentListener.mock.calls.filter(([type]) =>
        ["focusin", "keydown", "pointerdown"].includes(String(type)),
      ),
    ).toHaveLength(0);
  });

  test("closes on Escape and an outside pointer press", () => {
    render(
      <TavernKeeperScanIndicator projectId="directive" status={redStatus} />,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: Immediate danger; current/u,
    });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("toggles from a touch click and closes another open scan indicator", () => {
    render(
      <>
        <TavernKeeperScanIndicator projectId="directive" status={redStatus} />
        <TavernKeeperScanIndicator projectId="recursion" status={redStatus} />
      </>,
    );

    const [firstTrigger, secondTrigger] = screen.getAllByRole("button", {
      name: /TavernKeeper scan: Immediate danger; current/u,
    });
    fireEvent.pointerDown(firstTrigger, { pointerType: "touch" });
    fireEvent.focus(firstTrigger);
    fireEvent.click(firstTrigger);
    expect(firstTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(secondTrigger);
    expect(firstTrigger).toHaveAttribute("aria-expanded", "false");
    expect(secondTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(secondTrigger, { pointerType: "touch" });
    fireEvent.click(secondTrigger);
    expect(secondTrigger).toHaveAttribute("aria-expanded", "false");
  });

  test("removes scan-indicator transitions for reduced motion", () => {
    const stylesheet = postcss.parse(
      readFileSync("src/styles/catalog.css", "utf8"),
    );
    const reducedMotionRule = stylesheet.nodes.find(
      (rule): rule is AtRule =>
        rule.type === "atrule" &&
        rule.name === "media" &&
        rule.params === "(prefers-reduced-motion: reduce)",
    );

    expect(reducedMotionRule).toBeDefined();
    if (!reducedMotionRule)
      throw new Error("Reduced-motion media rule missing.");
    const transitionRule = reducedMotionRule.nodes?.find(
      (rule): rule is Rule =>
        rule.type === "rule" && rule.selector.includes(".tavernkeeper-popover"),
    );
    expect(transitionRule).toBeDefined();
    if (!transitionRule)
      throw new Error("Reduced-motion transition rule missing.");
    expect(
      transitionRule.nodes?.some(
        (declaration) =>
          declaration.type === "decl" &&
          declaration.prop === "transition" &&
          declaration.value === "none",
      ),
    ).toBe(true);
  });

  test("wraps unforeseen long summary tokens within the popover", () => {
    const stylesheet = postcss.parse(
      readFileSync("src/styles/catalog.css", "utf8"),
    );
    const summaryRule = stylesheet.nodes.find(
      (rule): rule is Rule =>
        rule.type === "rule" && rule.selector === ".tavernkeeper-summary",
    );

    expect(summaryRule).toBeDefined();
    expect(
      summaryRule?.nodes.some(
        (declaration) =>
          declaration.type === "decl" &&
          declaration.prop === "overflow-wrap" &&
          declaration.value === "anywhere",
      ),
    ).toBe(true);
  });

  test("keeps decorative hover fine-pointer-only and exposes a 44px coarse hit target", () => {
    const stylesheet = postcss.parse(
      readFileSync("src/styles/catalog.css", "utf8"),
    );
    const fineHover = stylesheet.nodes.find(
      (rule): rule is AtRule =>
        rule.type === "atrule" &&
        rule.name === "media" &&
        rule.params === "(hover: hover) and (pointer: fine)",
    );
    expect(
      fineHover?.nodes?.some(
        (rule) =>
          rule.type === "rule" &&
          rule.selector.includes(".tavernkeeper-scan-indicator-trigger:hover"),
      ),
    ).toBe(true);

    const coarsePointer = stylesheet.nodes.find(
      (rule): rule is AtRule =>
        rule.type === "atrule" &&
        rule.name === "media" &&
        rule.params === "(pointer: coarse)",
    );
    const hitTarget = coarsePointer?.nodes?.find(
      (rule): rule is Rule =>
        rule.type === "rule" &&
        rule.selector.includes(".tavernkeeper-scan-indicator-trigger::before"),
    );
    expect(hitTarget).toBeDefined();
    expect(
      hitTarget?.nodes?.some(
        (declaration) =>
          declaration.type === "decl" &&
          declaration.prop === "inset" &&
          declaration.value === "-14px",
      ),
    ).toBe(true);
  });
});
