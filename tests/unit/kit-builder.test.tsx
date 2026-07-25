import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ProjectGrid } from "@/features/catalog/components/project-grid";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import { KitBuilder } from "@/features/kits/components/kit-builder";
import type { CatalogKit, KitDraft } from "@/features/kits/kit-types";
import { useKitWorkspace } from "@/features/kits/use-kit-workspace";

const originalMatchMedia = window.matchMedia;

function mockTouchLayout() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === "(max-width: 1050px), (pointer: coarse)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function project(
  id: string,
  kind: CatalogProject["kind"] = "extension",
): CatalogProject {
  return {
    id,
    name: id,
    kind,
    metadataStatus: "curated",
    sourceStatus: "healthy",
    primaryFunction: kind === "frontend" ? "frontend" : "generation-reasoning",
    summary: `${id} summary`,
    canonicalUrl: `https://example.com/${id}`,
    catalogedAt: "2026-07-01T00:00:00.000Z",
    catalogCohort: "standard",
    frontends: [],
    capabilities: [],
    searchableText: id,
    activity: {
      latestMeaningfulCommitAt: null,
      activeWeeks12: null,
      twoWeekBars: null,
      strength: null,
      dormant: false,
    },
    latestReleaseAt: null,
    community: null,
    repositorySizeKb: null,
    license: { status: "missing", label: "Missing", tooltip: "Missing" },
    preset: null,
    refreshedAt: null,
    staleSince: null,
  };
}

const projects = [
  project("frontend", "frontend"),
  project("memory"),
  project("preset", "preset"),
  project("extra"),
];

const kit: CatalogKit = {
  id: "story-kit-41",
  title: "Story Kit",
  description: "A compact story stack.",
  author: { githubUserId: 123, login: "author" },
  sourceIssueNumber: 41,
  publishedAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
  tavernaryPick: false,
  frontends: [],
  purposes: [],
  components: projects.slice(0, 3).map((entry) => ({
    projectId: entry.id,
    name: entry.name,
    kind: entry.kind,
    primaryFunction: entry.primaryFunction,
    availability: "available",
    unavailableReason: null,
    canonicalUrl: entry.canonicalUrl,
    project: entry,
  })),
  supporterCount: null,
  trendingScore: null,
  supportRefreshedAt: null,
  supportStale: false,
  flaggedProjectCount: 0,
  searchableText: "story kit",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

describe("Kit builder state", () => {
  test("starts create, duplicate, and edit drafts without mutating the live Kit", () => {
    const onSelectKit = vi.fn();
    const { result } = renderHook(() =>
      useKitWorkspace({ selectedKitId: "", onSelectKit }),
    );
    act(() => result.current.startCreate());
    expect(result.current.state).toMatchObject({
      mode: "build",
      draft: {
        operation: "create",
        kitId: null,
        title: "",
        description: "",
        projectIds: [],
      },
      dirty: false,
    });
    act(() => result.current.startDuplicate(kit));
    expect(result.current.state).toMatchObject({
      mode: "build",
      draft: {
        operation: "create",
        kitId: null,
        title: "Story Kit",
        projectIds: ["frontend", "memory", "preset"],
      },
    });
    act(() => result.current.startEdit(kit));
    expect(result.current.state).toMatchObject({
      mode: "build",
      draft: { operation: "edit", kitId: "story-kit-41" },
    });
    act(() => result.current.updateDraft({ title: "Changed" }));
    expect(kit.title).toBe("Story Kit");
  });

  test("registers beforeunload only while a draft is dirty", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { result, unmount } = renderHook(() =>
      useKitWorkspace({ selectedKitId: "", onSelectKit: vi.fn() }),
    );
    act(() => result.current.startCreate());
    expect(add.mock.calls.some(([name]) => name === "beforeunload")).toBe(
      false,
    );
    act(() => result.current.updateDraft({ title: "Dirty" }));
    expect(add.mock.calls.some(([name]) => name === "beforeunload")).toBe(true);
    unmount();
    expect(remove.mock.calls.some(([name]) => name === "beforeunload")).toBe(
      true,
    );
  });
});

describe("Kit builder controls", () => {
  const validDraft: KitDraft = {
    operation: "create",
    kitId: null,
    title: "Story Kit",
    description: "A compact story stack.",
    projectIds: ["frontend", "memory", "preset"],
  };

  test("uses stable labels and reveals validation only after interaction", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <KitBuilder
        draft={{
          ...validDraft,
          title: "No",
          description: "",
          projectIds: [],
        }}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={onUpdate}
        onSubmit={onSubmit}
      />,
    );

    const title = screen.getByRole("textbox", { name: "Title" });
    const description = screen.getByRole("textbox", {
      name: "Description",
    });
    expect(title).toHaveAccessibleDescription("2/60 characters");
    expect(description).toHaveAccessibleDescription("0/100 words");
    expect(
      screen.queryByRole("list", { name: "Kit validation" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Kit" })).toBeEnabled();

    await user.click(title);
    await user.tab();
    expect(
      screen.getByText("Title must contain 3–60 characters."),
    ).toBeVisible();
    expect(
      screen.queryByText("A Kit must contain 3–50 projects."),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submit Kit" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("A Kit must contain 3–50 projects.")).toBeVisible();

    rerender(
      <KitBuilder
        draft={validDraft}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={onUpdate}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Submit Kit" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  test("enforces duplicate changes and row actions", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <KitBuilder
        draft={validDraft}
        projects={projects}
        originalProjectIds={validDraft.projectIds}
        onUpdate={onUpdate}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Submit Kit" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText("A duplicate must change the selected project set."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Move memory up" }));
    expect(onUpdate).toHaveBeenCalledWith({
      projectIds: ["memory", "frontend", "preset"],
    });
    await user.click(screen.getByRole("button", { name: "Remove preset" }));
    expect(onUpdate).toHaveBeenCalledWith({
      projectIds: ["frontend", "memory"],
    });

    rerender(
      <KitBuilder
        draft={{
          ...validDraft,
          projectIds: [...validDraft.projectIds, "extra"],
        }}
        projects={projects}
        originalProjectIds={validDraft.projectIds}
        onUpdate={onUpdate}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Submit Kit" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  test("omits drag handles on touch layouts but keeps explicit order controls", () => {
    mockTouchLayout();
    render(
      <KitBuilder
        draft={validDraft}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Drag memory" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move memory up" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Move memory down" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove memory" })).toBeVisible();
  });

  test("restores a removed project at its prior index for six seconds", () => {
    mockTouchLayout();
    vi.useFakeTimers();

    function Harness() {
      const [draft, setDraft] = useState(validDraft);
      return (
        <KitBuilder
          draft={draft}
          projects={projects}
          originalProjectIds={[]}
          onUpdate={(patch) =>
            setDraft((current) => ({ ...current, ...patch }))
          }
          onSubmit={() => undefined}
        />
      );
    }

    const { container } = render(<Harness />);
    const rowIds = () =>
      Array.from(container.querySelectorAll("[data-project-id]")).map((row) =>
        row.getAttribute("data-project-id"),
      );

    fireEvent.click(screen.getByRole("button", { name: "Remove memory" }));
    expect(rowIds()).toEqual(["frontend", "preset"]);
    const undoStatus = screen.getByRole("status");
    expect(undoStatus).toHaveAttribute("aria-live", "assertive");
    expect(undoStatus).toHaveTextContent("Removed memory.");
    fireEvent.click(screen.getByRole("button", { name: "Undo remove memory" }));
    expect(rowIds()).toEqual(["frontend", "memory", "preset"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove memory" }));
    act(() => vi.advanceTimersByTime(6000));
    expect(
      screen.queryByRole("button", { name: "Undo remove memory" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove preset" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove frontend" }));
    expect(
      screen.queryByRole("button", { name: "Undo remove preset" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Undo remove frontend" }),
    );
    expect(rowIds()).toEqual(["frontend"]);
  });

  test("renders Add to Kit as a sibling of the project link", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { container } = render(
      <ProjectGrid
        projects={[projects[0]]}
        now="2026-07-24T00:00:00.000Z"
        draftProjectIds={[]}
        onAddToKit={onAdd}
      />,
    );
    const link = screen.getByRole("link", { name: "frontend" });
    const add = screen.getByRole("button", { name: "Add frontend to Kit" });
    expect(link.contains(add)).toBe(false);
    expect(
      container.querySelector(".project-card-shell")?.children,
    ).toHaveLength(2);
    await user.click(add);
    expect(onAdd).toHaveBeenCalledWith("frontend");
  });

  test("captures pointer drag from handles, cancels with Escape, and commits once", () => {
    const onUpdate = vi.fn();
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: {
        configurable: true,
        value: setPointerCapture,
      },
      releasePointerCapture: {
        configurable: true,
        value: releasePointerCapture,
      },
    });
    render(
      <KitBuilder
        draft={validDraft}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={onUpdate}
        onSubmit={() => undefined}
      />,
    );
    const memoryHandle = screen.getByRole("button", {
      name: "Drag memory",
    });
    const presetRow = screen
      .getAllByText("preset")[0]
      .closest("[data-project-id]") as HTMLElement;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn().mockReturnValue(presetRow),
    });
    vi.spyOn(presetRow, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 100,
      top: 100,
      left: 0,
      right: 100,
      bottom: 140,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(memoryHandle, { pointerId: 7, clientY: 110 });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    fireEvent.pointerMove(window, {
      pointerId: 7,
      clientX: 5,
      clientY: 130,
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.pointerDown(memoryHandle, { pointerId: 8, clientY: 110 });
    fireEvent.pointerMove(window, {
      pointerId: 8,
      clientX: 5,
      clientY: 130,
    });
    fireEvent.pointerUp(window, { pointerId: 8 });
    fireEvent.pointerUp(window, { pointerId: 8 });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      projectIds: ["frontend", "preset", "memory"],
    });
    expect(releasePointerCapture).toHaveBeenCalled();
  });
});
