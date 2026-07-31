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
import { type ComponentProps, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CatalogProject } from "@/features/catalog/catalog-types";
import { KitBuilder as ProductionKitBuilder } from "@/features/kits/components/kit-builder";
import type { CatalogKit, KitDraft } from "@/features/kits/kit-types";
import { useKitBuilder } from "@/features/kits/use-kit-builder";
import { catalogSearchFields } from "../helpers/catalog-search-fields";

const originalMatchMedia = window.matchMedia;

type TestKitBuilderProps = Omit<
  ComponentProps<typeof ProductionKitBuilder>,
  "onRevealFrontends"
> & {
  onRevealFrontends?: () => void;
};

function KitBuilder({
  onRevealFrontends = () => undefined,
  ...props
}: TestKitBuilderProps) {
  return (
    <ProductionKitBuilder {...props} onRevealFrontends={onRevealFrontends} />
  );
}

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
    tags: [],
    search: catalogSearchFields(id),
    searchableText: id,
    fork: null,
    attribution: null,
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
  sourceIssueUrl: "https://github.com/fixture/catalog/issues/41",
  publishedAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
  frontends: [],
  purposes: [],
  modelFamilies: [],
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
  search: catalogSearchFields("Story Kit"),
  searchableText: "story kit",
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

describe("Kit builder state", () => {
  test("starts collapsed when no visibility preference has been saved", () => {
    const { result } = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );

    expect(result.current.state.collapsed).toBe(true);
  });

  test("restores opened and reclosed visibility across remounts", () => {
    const first = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );
    expect(first.result.current.state.collapsed).toBe(true);
    act(() => first.result.current.toggleCollapsed());
    expect(first.result.current.state.collapsed).toBe(false);
    first.unmount();

    const openRefresh = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );
    expect(openRefresh.result.current.state.collapsed).toBe(false);
    act(() => openRefresh.result.current.toggleCollapsed());
    expect(openRefresh.result.current.state.collapsed).toBe(true);
    openRefresh.unmount();

    const closedRefresh = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );
    expect(closedRefresh.result.current.state.collapsed).toBe(true);
  });

  test("restores an unfinished Kit draft across remounts", async () => {
    const first = renderHook(() =>
      useKitBuilder({
        selectedKitId: "",
        onSelectKit: vi.fn(),
        projects,
      }),
    );

    act(() => first.result.current.startCreate());
    act(() =>
      first.result.current.updateDraft({
        title: "Saved Kit",
        description: "Continue this later.",
        projectIds: ["frontend", "memory"],
      }),
    );
    first.unmount();

    const restored = renderHook(() =>
      useKitBuilder({
        selectedKitId: "",
        onSelectKit: vi.fn(),
        projects,
      }),
    );

    await act(async () => undefined);
    expect(restored.result.current.state).toMatchObject({
      mode: "build",
      dirty: true,
      draft: {
        operation: "create",
        kitId: null,
        title: "Saved Kit",
        description: "Continue this later.",
        projectIds: ["frontend", "memory"],
      },
    });
    expect(restored.result.current.draftOrigin).toBe("create");
  });

  test("omits unavailable projects while restoring the rest of a draft", async () => {
    window.localStorage.setItem(
      "tavernary:kit-builder-draft:v1",
      JSON.stringify({
        schemaVersion: 1,
        savedAt: "2026-07-25T00:00:00.000Z",
        draftOrigin: "create",
        originalProjectIds: [],
        draft: {
          operation: "create",
          kitId: null,
          title: "Partially available",
          description: "",
          projectIds: ["frontend", "removed-project", "memory"],
        },
      }),
    );

    const restored = renderHook(() =>
      useKitBuilder({
        selectedKitId: "",
        onSelectKit: vi.fn(),
        projects,
      }),
    );

    await act(async () => undefined);
    expect(restored.result.current.state).toMatchObject({
      mode: "build",
      draft: { projectIds: ["frontend", "memory"] },
    });
    expect(restored.result.current.omittedProjectCount).toBe(1);
  });

  test("clears a malformed saved draft without breaking the workspace", async () => {
    window.localStorage.setItem(
      "tavernary:kit-builder-draft:v1",
      JSON.stringify({
        schemaVersion: 1,
        savedAt: "2026-07-25T00:00:00.000Z",
        draftOrigin: "edit",
        originalProjectIds: [],
        draft: {
          operation: "edit",
          kitId: null,
          title: "Broken edit",
          description: "",
          projectIds: [],
        },
      }),
    );

    const restored = renderHook(() =>
      useKitBuilder({
        selectedKitId: "",
        onSelectKit: vi.fn(),
        projects,
      }),
    );

    await act(async () => undefined);
    expect(restored.result.current.state).toMatchObject({ mode: "intro" });
    expect(
      window.localStorage.getItem("tavernary:kit-builder-draft:v1"),
    ).toBeNull();
  });

  test("applies a draft update written by another browser tab", async () => {
    const current = renderHook(() =>
      useKitBuilder({
        selectedKitId: "",
        onSelectKit: vi.fn(),
        projects,
      }),
    );
    await act(async () => undefined);

    const externalDraft = JSON.stringify({
      schemaVersion: 1,
      savedAt: "2026-07-25T01:00:00.000Z",
      draftOrigin: "create",
      originalProjectIds: [],
      draft: {
        operation: "create",
        kitId: null,
        title: "Changed elsewhere",
        description: "",
        projectIds: ["frontend"],
      },
    });
    window.localStorage.setItem(
      "tavernary:kit-builder-draft:v1",
      externalDraft,
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "tavernary:kit-builder-draft:v1",
          newValue: externalDraft,
          storageArea: window.localStorage,
        }),
      );
    });

    expect(current.result.current.state).toMatchObject({
      mode: "build",
      dirty: true,
      draft: {
        title: "Changed elsewhere",
        projectIds: ["frontend"],
      },
    });
  });

  test("discards the active draft from memory and browser storage", () => {
    const onSelectKit = vi.fn();
    const current = renderHook(() =>
      useKitBuilder({
        selectedKitId: "",
        onSelectKit,
        projects,
      }),
    );

    act(() => current.result.current.startCreate());
    act(() => current.result.current.updateDraft({ title: "Discard me" }));
    expect(
      window.localStorage.getItem("tavernary:kit-builder-draft:v1"),
    ).not.toBeNull();

    act(() => current.result.current.discardDraft());

    expect(current.result.current.state).toMatchObject({ mode: "intro" });
    expect(
      window.localStorage.getItem("tavernary:kit-builder-draft:v1"),
    ).toBeNull();
    expect(onSelectKit).toHaveBeenCalledWith("");
  });

  test("returns to Intro when another browser tab discards the draft", () => {
    const current = renderHook(() =>
      useKitBuilder({
        selectedKitId: "",
        onSelectKit: vi.fn(),
        projects,
      }),
    );
    act(() => current.result.current.startCreate());
    act(() => current.result.current.updateDraft({ title: "Shared draft" }));

    window.localStorage.removeItem("tavernary:kit-builder-draft:v1");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "tavernary:kit-builder-draft:v1",
          newValue: null,
          storageArea: window.localStorage,
        }),
      );
    });

    expect(current.result.current.state).toMatchObject({ mode: "intro" });
  });

  test("starts create, duplicate, and edit drafts without mutating the live Kit", () => {
    const onSelectKit = vi.fn();
    const { result } = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit }),
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
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
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
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
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

  test("applies a project batch without changing an open builder", () => {
    const { result } = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );
    act(() => result.current.toggleCollapsed());

    let plan;
    act(() => {
      plan = result.current.applyProjectBatch(["memory", "frontend"], projects);
    });

    expect(plan).toMatchObject({
      projectIds: ["frontend", "memory"],
      addedProjectIds: ["memory", "frontend"],
    });
    expect(result.current.state).toEqual({
      mode: "build",
      collapsed: false,
      dirty: true,
      draft: {
        operation: "create",
        kitId: null,
        title: "",
        description: "",
        projectIds: ["frontend", "memory"],
      },
    });
    expect(result.current.draftOrigin).toBe("create");
  });

  test("starts an untouched card-selection draft without closing the builder", () => {
    const { result } = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );

    act(() => result.current.toggleCollapsed());
    act(() => result.current.startSelectionDraft());

    expect(result.current.state).toMatchObject({
      mode: "build",
      collapsed: false,
      dirty: false,
      draft: {
        operation: "create",
        title: "",
        description: "",
        projectIds: [],
      },
    });
  });

  test("starts an untouched card-selection draft without opening a collapsed builder", () => {
    const { result } = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );

    act(() => result.current.startSelectionDraft());

    expect(result.current.state).toMatchObject({
      mode: "build",
      collapsed: true,
      dirty: false,
    });
  });

  test("can preserve a visually hidden responsive builder on first selection", () => {
    const { result } = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );

    act(() => result.current.startSelectionDraft({ collapsed: true }));

    expect(result.current.state).toMatchObject({
      mode: "build",
      collapsed: true,
      dirty: false,
    });
  });

  test("discards only an untouched empty selection-started draft", () => {
    const { result } = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );

    act(() => result.current.toggleCollapsed());
    act(() => result.current.startSelectionDraft());
    act(() => result.current.discardUntouchedSelectionDraft());
    expect(result.current.state).toEqual({
      mode: "intro",
      collapsed: false,
    });

    act(() => result.current.toggleCollapsed());
    act(() => result.current.startSelectionDraft());
    act(() => result.current.discardUntouchedSelectionDraft());
    expect(result.current.state).toEqual({
      mode: "intro",
      collapsed: true,
    });

    act(() => result.current.startSelectionDraft());
    act(() => result.current.updateDraft({ title: "Keep me" }));
    act(() => result.current.discardUntouchedSelectionDraft());
    expect(result.current.state.mode).toBe("build");
  });

  test("removes a persisted empty draft when its only selection is cancelled", () => {
    const { result } = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );

    act(() => result.current.startSelectionDraft());
    expect(
      window.localStorage.getItem("tavernary:kit-builder-draft:v1"),
    ).not.toBeNull();
    act(() => result.current.discardUntouchedSelectionDraft());

    expect(result.current.state).toMatchObject({ mode: "intro" });
    expect(
      window.localStorage.getItem("tavernary:kit-builder-draft:v1"),
    ).toBeNull();
  });

  test("removes one draft project through the workspace", () => {
    const { result } = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );
    act(() => result.current.startCreate());
    act(() => {
      result.current.applyProjectBatch(["frontend", "memory"], projects);
    });

    let removed = false;
    act(() => {
      removed = result.current.removeProjectFromDraft("memory");
    });

    expect(removed).toBe(true);
    expect(result.current.state).toMatchObject({
      mode: "build",
      dirty: true,
      draft: { projectIds: ["frontend"] },
    });
  });

  test("appends a batch without opening the builder or replacing draft metadata", () => {
    const { result } = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );
    act(() => result.current.startCreate());
    act(() =>
      result.current.updateDraft({
        title: "Kept title",
        description: "Kept description",
        projectIds: ["frontend", "memory"],
      }),
    );
    act(() => result.current.toggleCollapsed());

    act(() => {
      result.current.applyProjectBatch(["preset"], projects);
    });

    expect(result.current.state).toMatchObject({
      mode: "build",
      collapsed: true,
      dirty: true,
      draft: {
        title: "Kept title",
        description: "Kept description",
        projectIds: ["frontend", "memory", "preset"],
      },
    });
  });

  test("does not create a draft when a project batch adds nothing", () => {
    const { result } = renderHook(() =>
      useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
    );

    act(() => {
      result.current.applyProjectBatch(["unknown"], projects);
    });

    expect(result.current.state).toEqual({
      mode: "intro",
      collapsed: true,
    });
    expect(result.current.draftOrigin).toBeNull();
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

  test("teaches and invokes Frontend catalog discovery from the empty slot", async () => {
    const user = userEvent.setup();
    const onRevealFrontends = vi.fn();

    render(
      <KitBuilder
        draft={{ ...validDraft, projectIds: [] }}
        projects={projects}
        originalProjectIds={[]}
        onRevealFrontends={onRevealFrontends}
        onUpdate={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    const shortcut = screen.getByRole("button", {
      name: "Show Frontend cards",
    });
    expect(shortcut).toHaveTextContent("Add a Frontend");
    expect(shortcut).toHaveTextContent("Choose one from the catalog cards");

    await user.click(shortcut);
    expect(onRevealFrontends).toHaveBeenCalledOnce();
  });

  test("uses the shared primary treatment for submission", () => {
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
      screen.getByRole("button", { name: "Review Kit request" }),
    ).toHaveClass("control-primary");
  });

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

  test("labels Frontend and Extensions & Presets as separate composition sections", () => {
    render(
      <KitBuilder
        draft={validDraft}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(screen.getByRole("region", { name: "Frontend" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Extensions & Presets" }),
    ).toBeVisible();
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
      screen.getByRole("button", { name: "Remove memory from Kit" }),
    ).toHaveTextContent("−");
    expect(
      screen.getByRole("button", { name: "Remove memory from Kit" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("×")).not.toBeInTheDocument();
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
      screen.getByRole("button", { name: "Remove frontend from Kit" }),
    ).toHaveTextContent("−");
    expect(
      screen.getByRole("button", { name: "Remove frontend from Kit" }),
    ).toHaveAttribute("aria-pressed", "true");
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
    expect(description).toHaveAttribute("maxlength", "600");
    expect(description).toHaveAccessibleDescription("0/600 characters");
    expect(
      screen.queryByRole("list", { name: "Kit validation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review Kit request" }),
    ).toBeEnabled();

    await user.click(title);
    await user.tab();
    expect(
      screen.getByText("Title must contain 3–60 characters."),
    ).toBeVisible();
    expect(
      screen.queryByText("A Kit must contain 3–50 projects."),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Review Kit request" }),
    );
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
    await user.click(
      screen.getByRole("button", { name: "Review Kit request" }),
    );
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  test("blocks severe title and description text with field-level focus", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <KitBuilder
        draft={{ ...validDraft, title: "N1gg3r Story Kit" }}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={() => undefined}
        onSubmit={onSubmit}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Review Kit request" }),
    );
    const title = screen.getByRole("textbox", { name: "Title" });
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Title contains language Tavernary doesn't allow."),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(
      <KitBuilder
        draft={{
          ...validDraft,
          title: "Story Kit",
          description: "A f.a.g.g.o.t story stack.",
        }}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={() => undefined}
        onSubmit={onSubmit}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Review Kit request" }),
    );
    const description = screen.getByRole("textbox", {
      name: "Description",
    });
    expect(description).toHaveFocus();
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText(
        "Description contains language Tavernary doesn't allow.",
      ),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
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
    await user.click(
      screen.getByRole("button", { name: "Review Kit request" }),
    );
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
    await user.click(
      screen.getByRole("button", { name: "Review Kit request" }),
    );
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
    expect(
      screen.getByRole("button", { name: "Remove memory from Kit" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove frontend from Kit" }),
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

    fireEvent.click(
      screen.getByRole("button", { name: "Remove memory from Kit" }),
    );
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
    await user.click(
      screen.getByRole("button", { name: "Remove memory from Kit" }),
    );
    expect(
      screen.getByRole("button", { name: "Remove preset from Kit" }),
    ).toHaveFocus();
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
    expect(ghost).toHaveAttribute("data-kind", "extension");
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
