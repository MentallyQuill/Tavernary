import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { Tooltip } from "@/components/ui/tooltip";
import { SearchHelp } from "@/features/search/components/search-help";
import { TavernKeeperScanIndicator } from "@/features/catalog/components/tavernkeeper-scan-indicator";
import { animationFrames } from "../helpers/animation-frames";

const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((media) => ({
      matches: false,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

const surfaces = [
  {
    name: "tooltip",
    element: (
      <Tooltip id="test-tooltip" label="Details">
        <button>Tooltip trigger</button>
      </Tooltip>
    ),
    triggerName: "Tooltip trigger",
    role: "tooltip",
    initial: { left: "80px", top: "152px" },
    moved: { left: "230px", top: "252px" },
  },
  {
    name: "search help",
    element: <SearchHelp />,
    triggerName: "Search help",
    role: "dialog",
    initial: { left: "60px", top: "228px" },
    moved: { left: "210px", top: "328px" },
  },
  {
    name: "scan indicator",
    element: (
      <TavernKeeperScanIndicator
        projectId="test"
        status={{
          state: "gray",
          riskLevel: null,
          freshness: "unassessed",
          currentSha: null,
          report: null,
          history: [],
          historyUrl: null,
        }}
      />
    ),
    triggerName: "TavernKeeper scan: Not assessed.",
    role: "dialog",
    initial: { left: "80px", top: "152px" },
    moved: { left: "230px", top: "252px" },
  },
] as const;

function floatingHarness(surface: (typeof surfaces)[number]) {
  const frames = animationFrames();
  let triggerRect = new DOMRect(100, 200, 20, 20);
  const measure = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("role")
        ? new DOMRect(0, 0, 60, 40)
        : triggerRect;
    });
  const commits = vi.fn();
  const rendered = render(
    <Profiler id="surface" onRender={commits}>
      {surface.element}
    </Profiler>,
  );
  const trigger = screen.getByRole("button", { name: surface.triggerName });
  const open = () => {
    if (surface.name === "tooltip") fireEvent.pointerEnter(trigger);
    else fireEvent.click(trigger);
  };
  open();
  return {
    ...rendered,
    frames,
    trigger,
    measure,
    commits,
    open,
    moveAnchor() {
      triggerRect = new DOMRect(250, 300, 20, 20);
    },
  };
}

test.each(surfaces)(
  "$name batches scroll and resize bursts and positions from the latest anchor",
  (surface) => {
    const { frames, measure, moveAnchor } = floatingHarness(surface);
    const panel = screen.getByRole(surface.role);
    expect(panel).toHaveStyle(surface.initial);
    measure.mockClear();
    moveAnchor();
    fireEvent.scroll(window);
    fireEvent.resize(window);
    fireEvent.scroll(window);
    expect(measure).not.toHaveBeenCalled();
    expect(panel).toHaveStyle(surface.initial);
    expect(frames.pendingCount).toBe(1);
    frames.flush();
    expect(measure).toHaveBeenCalledTimes(2);
    expect(panel).toHaveStyle(surface.moved);
  },
);

test.each(surfaces)(
  "$name avoids a render when its measured position has not changed",
  (surface) => {
    const { frames, commits } = floatingHarness(surface);
    commits.mockClear();
    fireEvent.scroll(window);
    frames.flush();
    expect(commits).not.toHaveBeenCalled();
  },
);

test.each(surfaces)(
  "$name cancels the queued frame on close and can schedule after reopening",
  (surface) => {
    const { frames, measure, open } = floatingHarness(surface);
    fireEvent.scroll(window);
    expect(frames.pendingCount).toBe(1);
    fireEvent.keyDown(document, { key: "Escape" });
    if (surface.name !== "tooltip")
      expect(
        screen.getByRole("button", { name: surface.triggerName }),
      ).toHaveFocus();
    expect(screen.queryByRole(surface.role)).toBeNull();
    expect(frames.pendingCount).toBe(0);
    measure.mockClear();
    frames.flush();
    fireEvent.scroll(window);
    expect(frames.pendingCount).toBe(0);
    expect(measure).not.toHaveBeenCalled();
    open();
    expect(screen.getByRole(surface.role)).toHaveStyle(surface.initial);
    fireEvent.resize(window);
    expect(frames.pendingCount).toBe(1);
    frames.flush();
  },
);

test.each(surfaces)("$name cancels positioning on unmount", (surface) => {
  const { frames, measure, unmount } = floatingHarness(surface);
  fireEvent.scroll(window);
  expect(frames.pendingCount).toBe(1);
  unmount();
  measure.mockClear();
  expect(frames.pendingCount).toBe(0);
  frames.flush();
  fireEvent.resize(window);
  expect(measure).not.toHaveBeenCalled();
  expect(frames.pendingCount).toBe(0);
});

test.each(surfaces)(
  "$name dismisses when its anchor becomes hidden before a positioning frame",
  (surface) => {
    const { frames, container } = floatingHarness(surface);
    container.style.display = "none";
    fireEvent.scroll(window);
    frames.flush();
    expect(screen.queryByRole(surface.role)).toBeNull();
    expect(frames.pendingCount).toBe(0);
  },
);

test.each(surfaces.slice(1))(
  "$name coalesces visual viewport changes and retains collision bounds",
  (surface) => {
    const viewport = Object.assign(new EventTarget(), {
      width: 200,
      height: 250,
      offsetLeft: 30,
      offsetTop: 40,
    });
    vi.stubGlobal("visualViewport", viewport);
    const { frames, measure, moveAnchor } = floatingHarness(surface);
    measure.mockClear();
    moveAnchor();
    viewport.dispatchEvent(new Event("scroll"));
    viewport.dispatchEvent(new Event("resize"));
    fireEvent.scroll(window);
    expect(measure).not.toHaveBeenCalled();
    expect(frames.pendingCount).toBe(1);
    frames.flush();
    expect(screen.getByRole(surface.role)).toHaveStyle({
      left: "162px",
      top: "242px",
    });
    fireEvent.keyDown(document, { key: "Escape" });
    viewport.dispatchEvent(new Event("resize"));
    expect(frames.pendingCount).toBe(0);
  },
);
