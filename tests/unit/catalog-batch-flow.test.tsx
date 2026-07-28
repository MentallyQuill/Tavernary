import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string;
    alt: string;
    [key: string]: unknown;
  }) => <span data-image-src={src} aria-label={alt || undefined} {...props} />,
}));

vi.mock("@/features/kits/submission-transport", () => ({
  openKitSubmission: vi.fn(),
}));

import { CatalogPage } from "@/features/catalog/components/catalog-page";
import type { Catalog, CatalogProject } from "@/features/catalog/catalog-types";
import { openKitSubmission } from "@/features/kits/submission-transport";

const originalMatchMedia = window.matchMedia;

function mockDesktopMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
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

function project(): CatalogProject {
  return {
    id: "memory",
    name: "Memory",
    kind: "extension",
    metadataStatus: "curated",
    sourceStatus: "healthy",
    primaryFunction: "memory-retrieval",
    summary: "Memory summary",
    canonicalUrl: "https://example.com/memory",
    catalogedAt: "2026-07-01T00:00:00.000Z",
    catalogCohort: "standard",
    frontends: [],
    capabilities: [],
    searchableText: "memory",
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

const catalog: Catalog = {
  schemaVersion: 3,
  generatedAt: "2026-07-24T00:00:00.000Z",
  projects: [project()],
  kits: [],
};

const submissionCatalog: Catalog = {
  ...catalog,
  projects: [
    {
      ...project(),
      id: "frontend",
      name: "Frontend",
      kind: "frontend",
      primaryFunction: "frontend",
      canonicalUrl: "https://example.com/frontend",
      searchableText: "frontend",
    },
    project(),
    {
      ...project(),
      id: "preset",
      name: "Preset",
      kind: "preset",
      primaryFunction: "generation-reasoning",
      canonicalUrl: "https://example.com/preset",
      searchableText: "preset",
    },
  ],
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.useRealTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

describe("catalog Kit batch flow", () => {
  test("reveals Frontend cards through the visible shared filter", () => {
    mockDesktopMatchMedia();
    render(<CatalogPage catalog={submissionCatalog} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Kit Builder" }));
    fireEvent.click(screen.getByRole("button", { name: "Create new Kit" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show Frontend cards" }),
    );

    expect(screen.getByRole("checkbox", { name: "Frontend" })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Remove Frontend" }),
    ).toBeVisible();
    expect(new URLSearchParams(window.location.search).getAll("kind")).toEqual([
      "frontend",
    ]);
    expect(screen.getByRole("link", { name: "Frontend" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Memory" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Frontend" }));
    expect(
      screen.getByRole("checkbox", { name: "Frontend" }),
    ).not.toBeChecked();
    expect(new URLSearchParams(window.location.search).getAll("kind")).toEqual(
      [],
    );
  });

  test("preserves catalog filters and never toggles Frontend off", () => {
    mockDesktopMatchMedia();
    window.history.replaceState(
      null,
      "",
      "/?q=memory&kind=extension&license=missing",
    );
    render(<CatalogPage catalog={submissionCatalog} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Kit Builder" }));
    fireEvent.click(screen.getByRole("button", { name: "Create new Kit" }));
    const shortcut = screen.getByRole("button", {
      name: "Show Frontend cards",
    });
    fireEvent.click(shortcut);
    fireEvent.click(shortcut);

    expect(window.location.search).toContain("q=memory");
    expect(window.location.search).toContain("license=missing");
    expect(new URLSearchParams(window.location.search).getAll("kind")).toEqual([
      "extension",
      "frontend",
    ]);
    expect(screen.getByRole("checkbox", { name: "Frontend" })).toBeChecked();
  });

  test("returns from Kits mode to the project cards without discarding the draft", () => {
    mockDesktopMatchMedia();
    window.history.replaceState(null, "", "/?mode=kits");
    render(<CatalogPage catalog={submissionCatalog} />);

    fireEvent.click(screen.getByRole("button", { name: "Create Kit" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show Frontend cards" }),
    );

    expect(window.location.search).not.toContain("mode=kits");
    expect(window.location.search).toContain("kind=frontend");
    expect(
      screen.getByRole("region", { name: "Project catalog" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Create Kit" })).toBeVisible();
  });

  test("exposes collapsed builder state directly on the catalog layout", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const { container } = render(<CatalogPage catalog={catalog} />);
    const layout = container.querySelector(".catalog-layout");

    expect(layout).toHaveAttribute("data-kit-builder-collapsed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Open Kit Builder" }));

    expect(layout).toHaveAttribute("data-kit-builder-collapsed", "false");
  });

  test("keeps an open builder open when the final card selection is cancelled", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    render(<CatalogPage catalog={catalog} />);
    const builder = screen.getByRole("complementary", {
      name: "Kit Builder",
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Kit Builder" }));

    fireEvent.click(screen.getByRole("button", { name: "Add Memory to Kit" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Memory from selection" }),
    );

    expect(builder).not.toHaveClass("collapsed");
    expect(
      screen.getByRole("heading", { name: "Build and inspect Kits" }),
    ).toBeVisible();
  });

  test("returns to the introductory workspace after a confirmed draft discard", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    render(<CatalogPage catalog={catalog} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Kit Builder" }));
    fireEvent.click(screen.getByRole("button", { name: "Create new Kit" }));
    expect(
      window.localStorage.getItem("tavernary:kit-builder-draft:v1"),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard Kit" }));

    expect(
      screen.getByRole("heading", { name: "Build and inspect Kits" }),
    ).toBeVisible();
    expect(
      window.localStorage.getItem("tavernary:kit-builder-draft:v1"),
    ).toBeNull();
  });

  test("explains when a saved draft contains an unavailable project", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
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
          title: "Saved Kit",
          description: "",
          projectIds: ["memory", "removed"],
        },
      }),
    );

    render(<CatalogPage catalog={catalog} />);
    await act(async () => undefined);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Kit Builder, 1 project in draft",
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "1 saved project is no longer available and was removed from this draft.",
    );
  });

  test("clears a saved draft after a successful submission handoff", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.mocked(openKitSubmission).mockResolvedValue("prefilled");
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
          title: "Ready Kit",
          description: "Ready to submit.",
          projectIds: ["frontend", "memory", "preset"],
        },
      }),
    );

    render(<CatalogPage catalog={submissionCatalog} />);
    await act(async () => undefined);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Kit Builder, 3 projects in draft",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit Kit" }));

    await waitFor(() =>
      expect(
        window.localStorage.getItem("tavernary:kit-builder-draft:v1"),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("heading", { name: "Build and inspect Kits" }),
    ).toBeVisible();
  });

  test("adds an explicitly selected project without changing builder visibility, then settles its status", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    render(<CatalogPage catalog={catalog} />);
    const builder = screen.getByRole("complementary", {
      name: "Kit Builder",
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Kit Builder" }));
    expect(builder).not.toHaveClass("collapsed");

    fireEvent.click(screen.getByRole("button", { name: "Add Memory to Kit" }));
    expect(builder).not.toHaveClass("collapsed");
    expect(screen.getByRole("heading", { name: "Create Kit" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "1 project selected" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Add 1 project to Kit" }),
    );

    expect(builder).not.toHaveClass("collapsed");
    expect(screen.getByRole("heading", { name: "Create Kit" })).toBeVisible();
    expect(screen.getByText("1 projects")).toBeVisible();
    expect(
      screen.getByText("1 project added. 1 project in draft."),
    ).toHaveAttribute("aria-live", "polite");

    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByText("1 projects")).toBeVisible();
  });
});
