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
    result: "red",
    scannedSha: "abc1234def5678abc1234def5678abc1234def5678",
    scannedAt: "2026-07-31T12:00:00.000Z",
    mode: "standard",
    scannerPolicyVersion: "1",
    reportUrl: "https://example.test/reports/directive",
    historyUrl: "https://example.test/reports/directive/history",
    actionableSeverity: { critical: 1, high: 1, medium: 2 },
    ...overrides,
  };
}

const redReport = scanReport();
const redStatus: TavernKeeperCardStatus = {
  state: "red",
  reason: "current",
  currentSha: "abc1234def5678abc1234def5678abc1234def5678",
  report: redReport,
  history: [redReport],
  historyUrl: "https://example.test/reports/directive/history",
};

const tealReport = scanReport({
  result: "teal",
  actionableSeverity: { critical: 0, high: 0, medium: 0 },
});
const tealStatus: TavernKeeperCardStatus = {
  ...redStatus,
  state: "teal",
  report: tealReport,
  history: [tealReport],
};

const pendingStatus: TavernKeeperCardStatus = {
  state: "gray",
  reason: "unscanned",
  currentSha: "abc1234def5678abc1234def5678abc1234def5678",
  report: null,
  history: [],
  historyUrl: null,
};

const unsupportedStatus: TavernKeeperCardStatus = {
  state: "unsupported",
  reason: "unsupported",
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

  test("shows only the concise retained scan result", () => {
    const { container } = render(
      <TavernKeeperScanIndicator projectId="directive" status={redStatus} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /TavernKeeper scan: TavernKeeper found review-level concerns/u,
      }),
    );

    const panel = screen.getByRole("dialog", {
      name: "TavernKeeper Scan Results",
    });
    expect(panel).toHaveTextContent(
      "TavernKeeper found review-level concerns.",
    );
    expect(panel).toHaveTextContent("1 critical");
    expect(panel).toHaveTextContent("1 high");
    expect(panel).toHaveTextContent("2 medium");
    expect(panel).not.toHaveTextContent(/3 low|4 informational/u);
    expect(panel).toHaveTextContent("Scanned abc1234 on July 31, 2026");
    expect(
      within(panel).getByRole("link", { name: "View full report" }),
    ).toHaveAttribute("href", redStatus.report?.reportUrl);
    expect(
      within(panel).getByRole("link", { name: "View full scan history" }),
    ).toHaveAttribute("href", redStatus.historyUrl);
    expect(panel).not.toHaveTextContent(
      /Gitleaks|OpenGrep|policy|coverage|excluded/u,
    );
    expect(
      container.querySelector('svg[data-icon="scan-fill"]'),
    ).toBeInTheDocument();
  });

  test.each([
    [tealStatus, "No review-level concerns found at this commit."],
    [
      {
        ...tealStatus,
        state: "orange",
        reason: "outdated-clean",
      } satisfies TavernKeeperCardStatus,
      "The last completed scan found no review-level concerns, but it does not cover the repository's current commit. An updated scan is pending.",
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

  test("renders the newest twelve history conclusions oldest-left with accessible identity", () => {
    const history = Array.from({ length: 13 }, (_, index) =>
      scanReport({
        reportId: `report-${index + 1}`,
        result: index === 1 ? "red" : "teal",
        scannedSha: (index + 1).toString(16).padStart(40, "0"),
        scannedAt: `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
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
      "TavernKeeper scan history: red result on July 2, 2026 at commit 0000000 under policy policy-1",
    );
    expect(blocks.at(-1)).toHaveAccessibleName(
      "TavernKeeper scan history: teal result on July 13, 2026 at commit 0000000 under policy policy-1",
    );
    expect(blocks[0]).toHaveClass("tavernkeeper-history-red");
  });

  test("omits the severity count container when a retained report has no findings", () => {
    render(
      <TavernKeeperScanIndicator projectId="directive" status={tealStatus} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /TavernKeeper scan: No review-level concerns found/u,
      }),
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "No review-level concerns found at this commit.",
    );
    expect(
      document.querySelector(".tavernkeeper-severity-counts"),
    ).not.toBeInTheDocument();
  });

  test("keeps the popover open while the pointer moves from trigger to panel", () => {
    vi.useFakeTimers();
    render(
      <TavernKeeperScanIndicator projectId="directive" status={redStatus} />,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: TavernKeeper found review-level concerns/u,
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
      name: /TavernKeeper scan: TavernKeeper found review-level concerns/u,
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
      name: /TavernKeeper scan: TavernKeeper found review-level concerns/u,
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
        name: /TavernKeeper scan: TavernKeeper found review-level concerns/u,
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
      name: /TavernKeeper scan: TavernKeeper found review-level concerns/u,
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

  test("uses a non-modal Tab route through both report links without trapping linkless panels", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <TavernKeeperScanIndicator projectId="directive" status={redStatus} />
        <button type="button">Outside app control</button>
      </>,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: TavernKeeper found review-level concerns/u,
    });
    await user.tab();
    expect(trigger).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole("link", { name: "View full report" }),
    ).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole("link", { name: "View full scan history" }),
    ).toHaveFocus();

    await user.tab({ shift: true });
    expect(
      screen.getByRole("link", { name: "View full report" }),
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
      name: /TavernKeeper scan: TavernKeeper found review-level concerns/u,
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
      name: /TavernKeeper scan: TavernKeeper found review-level concerns/u,
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
