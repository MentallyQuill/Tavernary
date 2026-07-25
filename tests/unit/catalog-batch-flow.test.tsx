import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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

import { CatalogPage } from "@/features/catalog/components/catalog-page";
import type { Catalog, CatalogProject } from "@/features/catalog/catalog-types";

const originalMatchMedia = window.matchMedia;

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
  schemaVersion: 2,
  generatedAt: "2026-07-24T00:00:00.000Z",
  projects: [project()],
  kits: [],
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

describe("catalog Kit batch flow", () => {
  test("adds a long-pressed project without opening the builder, then settles its status", () => {
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
    const { container } = render(<CatalogPage catalog={catalog} />);
    const card = container.querySelector(".project-card-shell");
    expect(card).not.toBeNull();

    fireEvent.pointerDown(card!, {
      button: 0,
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    });
    act(() => vi.advanceTimersByTime(450));
    expect(
      screen.getByRole("region", { name: "1 projects selected" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Add to Kit" }));

    expect(
      screen.getByRole("complementary", { name: "Kit Builder" }),
    ).toHaveClass("collapsed");
    expect(
      screen.queryByRole("heading", { name: "Create Kit" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 project added")).toBeVisible();
    expect(
      screen.getByText("1 project added. 1 project in draft."),
    ).toHaveAttribute("aria-live", "polite");

    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByText("1 project in draft")).toBeVisible();
    expect(screen.queryByText("1 project added")).not.toBeInTheDocument();
  });
});
