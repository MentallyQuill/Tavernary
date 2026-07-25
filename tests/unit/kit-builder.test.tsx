import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
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
      latestSourceActivityAt: null,
      activeWeeks12: null,
      weeklyActivity: null,
      evidenceStatus: null,
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

  test("normalizes the Frontend first when duplicating or editing", () => {
    const reorderedKit: CatalogKit = {
      ...kit,
      components: [kit.components[1], kit.components[0], kit.components[2]],
    };
    const { result } = renderHook(() =>
      useKitWorkspace({ selectedKitId: "", onSelectKit: vi.fn() }),
    );

    act(() => result.current.startDuplicate(reorderedKit));
    expect(result.current.state).toMatchObject({
      mode: "build",
      draft: { projectIds: ["frontend", "memory", "preset"] },
    });
    act(() => result.current.startEdit(reorderedKit));
    expect(result.current.state).toMatchObject({
      mode: "build",
      draft: { projectIds: ["frontend", "memory", "preset"] },
    });
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

  test("pins the Frontend outside the ordered project stack", () => {
    const { container } = render(
      <KitBuilder
        draft={validDraft}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    const foundation = screen.getByRole("region", { name: "Frontend" });
    expect(within(foundation).getByText("frontend")).toBeVisible();
    expect(
      container.querySelector(
        '.kit-builder-stack [data-project-id="frontend"]',
      ),
    ).toBeNull();
  });

  test("uses a grab handle and corner remove control for stack projects", () => {
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
      screen.getByRole("button", {
        name: "Drag memory to reorder or remove",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove memory" }),
    ).toHaveTextContent("×");
    expect(
      screen.queryByRole("button", { name: "Move memory up" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Move memory down" }),
    ).not.toBeInTheDocument();
  });

  test("gives the desktop Frontend a removal handle and corner remove control", () => {
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
      screen.getByRole("button", { name: "Drag frontend to remove" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove frontend" }),
    ).toHaveTextContent("×");
  });

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

  test("enforces duplicate changes before submission", async () => {
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

  test("uses handles only for stack reordering on touch layouts", () => {
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
      screen.getByRole("button", { name: "Drag memory to reorder" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Drag frontend to remove" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove memory" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove frontend" }),
    ).toBeVisible();
  });

  test("removes a stack project immediately without an undo state", () => {
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
      Array.from(
        container.querySelectorAll(".kit-builder-stack [data-project-id]"),
      ).map((row) => row.getAttribute("data-project-id"));

    fireEvent.click(screen.getByRole("button", { name: "Remove memory" }));
    expect(rowIds()).toEqual(["preset"]);
    expect(screen.queryByText("Undo")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("moves focus to the nearest remaining remove control", async () => {
    const user = userEvent.setup();

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

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Remove memory" }));
    expect(screen.getByRole("button", { name: "Remove preset" })).toHaveFocus();
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

  test("offers to replace the selected Frontend instead of adding another", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const alternateFrontend = project("frontend-b", "frontend");
    render(
      <ProjectGrid
        projects={[projects[0], alternateFrontend]}
        now="2026-07-24T00:00:00.000Z"
        draftProjectIds={["frontend"]}
        draftFrontendId="frontend"
        onAddToKit={onAdd}
      />,
    );

    expect(
      screen.getByRole("button", { name: "frontend added to Kit" }),
    ).toBeDisabled();
    const replacement = screen.getByRole("button", {
      name: "Use frontend-b instead",
    });
    expect(replacement).toHaveTextContent("Use instead");
    await user.click(replacement);
    expect(onAdd).toHaveBeenCalledWith("frontend-b");
  });

  test("activates a stack drag only after four pixels of movement", () => {
    const onUpdate = vi.fn();
    const setPointerCapture = vi.fn();
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: {
        configurable: true,
        value: setPointerCapture,
      },
      releasePointerCapture: {
        configurable: true,
        value: vi.fn(),
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
      name: "Drag memory to reorder or remove",
    });

    fireEvent.pointerDown(memoryHandle, {
      pointerId: 7,
      clientX: 10,
      clientY: 10,
    });
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(document.querySelector(".kit-drag-ghost")).toBeNull();
    fireEvent.pointerMove(window, {
      pointerId: 7,
      clientX: 13,
      clientY: 10,
    });
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(document.querySelector(".kit-drag-ghost")).toBeNull();
    fireEvent.pointerMove(window, {
      pointerId: 7,
      clientX: 14,
      clientY: 10,
    });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(document.querySelector(".kit-drag-ghost")).not.toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("arms desktop drag-off removal outside the editor and commits on release", () => {
    const onUpdate = vi.fn();
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    const { container } = render(
      <KitBuilder
        draft={validDraft}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={onUpdate}
        onSubmit={() => undefined}
      />,
    );
    const editor = container.querySelector(".kit-builder") as HTMLElement;
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });
    const handle = screen.getByRole("button", {
      name: "Drag memory to reorder or remove",
    });

    fireEvent.pointerDown(handle, {
      pointerId: 9,
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerMove(window, {
      pointerId: 9,
      clientX: 101,
      clientY: 50,
    });
    expect(screen.getByText("Release to remove")).toBeVisible();
    expect(editor).toHaveAttribute("data-drag-intent", "remove");

    fireEvent.pointerUp(window, {
      pointerId: 9,
      clientX: 101,
      clientY: 50,
    });
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith({
      projectIds: ["frontend", "preset"],
    });
  });

  test("reorders from the focused handle with Alt and arrow keys", () => {
    const onUpdate = vi.fn();
    render(
      <KitBuilder
        draft={validDraft}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={onUpdate}
        onSubmit={() => undefined}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Drag memory to reorder or remove",
      }),
      { key: "ArrowDown", altKey: true },
    );
    expect(onUpdate).toHaveBeenCalledWith({
      projectIds: ["frontend", "preset", "memory"],
    });
  });

  test("renders a source-sized drag ghost outside the editor", () => {
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    const { container } = render(
      <KitBuilder
        draft={validDraft}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    const handle = screen.getByRole("button", {
      name: "Drag memory to reorder or remove",
    });
    const row = handle.closest("[data-project-id]") as HTMLElement;
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 20,
      top: 20,
      left: 10,
      right: 210,
      bottom: 80,
      width: 200,
      height: 60,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(handle, {
      pointerId: 11,
      clientX: 20,
      clientY: 30,
    });
    fireEvent.pointerMove(window, {
      pointerId: 11,
      clientX: 24,
      clientY: 30,
    });

    expect(container.querySelector(".kit-drag-ghost")).toBeNull();
    const ghost = document.body.querySelector(".kit-drag-ghost") as HTMLElement;
    expect(ghost).toHaveStyle({ width: "200px", height: "60px" });
  });

  test("opens a card-sized physical gap at the reorder target", () => {
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    const { container } = render(
      <KitBuilder
        draft={validDraft}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    const editor = container.querySelector(".kit-builder") as HTMLElement;
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".kit-builder-stack [data-project-id]",
      ),
    );
    rows.forEach((row, index) => {
      vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: index * 50,
        top: index * 50,
        left: 0,
        right: 200,
        bottom: index * 50 + 40,
        width: 200,
        height: 40,
        toJSON: () => ({}),
      });
    });
    const handle = screen.getByRole("button", {
      name: "Drag memory to reorder or remove",
    });
    fireEvent.pointerDown(handle, {
      pointerId: 12,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(window, {
      pointerId: 12,
      clientX: 14,
      clientY: 80,
    });

    expect(rows[0]).toHaveStyle({ transform: "translateY(47px)" });
    expect(rows[1]).toHaveStyle({ transform: "translateY(-47px)" });
  });
});
