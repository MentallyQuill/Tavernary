import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ProjectGrid } from "@/features/catalog/components/project-grid";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import { KitBuilder } from "@/features/kits/components/kit-builder";
import type { CatalogKit, KitDraft } from "@/features/kits/kit-types";
import { useKitWorkspace } from "@/features/kits/use-kit-workspace";

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

  test("enforces counters, validation, duplicate changes, and row actions", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <KitBuilder
        draft={{ ...validDraft, title: "No", description: "" }}
        projects={projects}
        originalProjectIds={[]}
        onUpdate={onUpdate}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText("2/60 characters")).toBeVisible();
    expect(screen.getByText("0/100 words")).toBeVisible();
    expect(screen.getByRole("button", { name: "Submit Kit" })).toBeDisabled();

    rerender(
      <KitBuilder
        draft={validDraft}
        projects={projects}
        originalProjectIds={validDraft.projectIds}
        onUpdate={onUpdate}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByRole("button", { name: "Submit Kit" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Submit Kit" })).toBeEnabled();
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
});
