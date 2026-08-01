import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TavernKeeperScanIndicator } from "@/features/catalog/components/tavernkeeper-scan-indicator";
import type { TavernKeeperCardStatus } from "@/features/catalog/tavernkeeper-status";

const yellowStatus: TavernKeeperCardStatus = {
  state: "yellow",
  reason: "current",
  currentSha: "abc1234def5678abc1234def5678abc1234def5678",
  report: {
    reportId: "report-1",
    result: "yellow",
    scannedSha: "abc1234def5678abc1234def5678abc1234def5678",
    scannedAt: "2026-07-31T12:00:00.000Z",
    reportUrl: "https://example.test/reports/directive",
    severity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
  },
};

const greenStatus: TavernKeeperCardStatus = {
  ...yellowStatus,
  state: "green",
  report: {
    ...yellowStatus.report,
    result: "green",
    severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  },
};

describe("TavernKeeperScanIndicator", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test("shows only the concise retained scan result", () => {
    const { container } = render(
      <TavernKeeperScanIndicator projectId="directive" status={yellowStatus} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /TavernKeeper scan: review suggested/u,
      }),
    );

    const panel = screen.getByRole("dialog", {
      name: "TavernKeeper Scan Results",
    });
    expect(panel).toHaveTextContent("Review suggested");
    expect(panel).toHaveTextContent("1 high");
    expect(panel).toHaveTextContent("Scanned abc1234 on July 31, 2026");
    expect(
      within(panel).getByRole("link", { name: "View full report" }),
    ).toHaveAttribute("href", yellowStatus.report.reportUrl);
    expect(panel).not.toHaveTextContent(
      /Gitleaks|OpenGrep|policy|coverage|excluded/u,
    );
    expect(
      container.querySelector('svg[data-icon="scan-fill"]'),
    ).toBeInTheDocument();
  });

  test("omits the severity count container when a retained report has no findings", () => {
    render(
      <TavernKeeperScanIndicator projectId="directive" status={greenStatus} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /TavernKeeper scan: no review-level findings/u,
      }),
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "No review-level findings",
    );
    expect(
      document.querySelector(".tavernkeeper-severity-counts"),
    ).not.toBeInTheDocument();
  });

  test("keeps the popover open while the pointer moves from trigger to panel", () => {
    vi.useFakeTimers();
    render(
      <TavernKeeperScanIndicator projectId="directive" status={yellowStatus} />,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: review suggested/u,
    });
    fireEvent.pointerEnter(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.pointerLeave(trigger);
    fireEvent.pointerEnter(screen.getByRole("dialog"));
    vi.advanceTimersByTime(150);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("closes 150 milliseconds after the pointer exits", () => {
    vi.useFakeTimers();
    render(
      <TavernKeeperScanIndicator projectId="directive" status={yellowStatus} />,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: review suggested/u,
    });
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerLeave(trigger);
    act(() => vi.advanceTimersByTime(149));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("keeps the popover open while focus moves within it and closes on focus exit", () => {
    render(
      <TavernKeeperScanIndicator projectId="directive" status={yellowStatus} />,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: review suggested/u,
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

  test("closes on Escape and an outside pointer press", () => {
    render(
      <TavernKeeperScanIndicator projectId="directive" status={yellowStatus} />,
    );

    const trigger = screen.getByRole("button", {
      name: /TavernKeeper scan: review suggested/u,
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
        <TavernKeeperScanIndicator
          projectId="directive"
          status={yellowStatus}
        />
        <TavernKeeperScanIndicator
          projectId="recursion"
          status={yellowStatus}
        />
      </>,
    );

    const [firstTrigger, secondTrigger] = screen.getAllByRole("button", {
      name: /TavernKeeper scan: review suggested/u,
    });
    fireEvent.pointerDown(firstTrigger, { pointerType: "touch" });
    fireEvent.click(firstTrigger);
    expect(firstTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(secondTrigger);
    expect(firstTrigger).toHaveAttribute("aria-expanded", "false");
    expect(secondTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(secondTrigger, { pointerType: "touch" });
    fireEvent.click(secondTrigger);
    expect(secondTrigger).toHaveAttribute("aria-expanded", "false");
  });
});
