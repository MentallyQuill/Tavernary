import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

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

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

import { CatalogPage } from "@/features/catalog/components/catalog-page";
import type { Catalog, CatalogProject } from "@/features/catalog/catalog-types";

const originalMatchMedia = window.matchMedia;

function project(
  id: string,
  name: string,
  overrides: Partial<CatalogProject> = {},
): CatalogProject {
  return {
    id,
    name,
    kind: "extension",
    metadataStatus: "curated",
    sourceStatus: "healthy",
    primaryFunction: "generation-reasoning",
    summary: `${name} summary`,
    canonicalUrl: `https://example.com/${id}`,
    catalogedAt: "2026-07-01T00:00:00Z",
    catalogCohort: "standard",
    frontends: [
      {
        id: "sillytavern",
        label: "SillyTavern",
        description: "Works with SillyTavern.",
      },
    ],
    capabilities: [],
    searchableText: `${name.toLowerCase()} relationship`,
    fork: null,
    attribution: null,
    activity: {
      latestSourceActivityAt: "2026-07-20T00:00:00Z",
      activeWeeks12: 1,
      weeklyActivity: [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
      ],
      evidenceStatus: "complete",
      dormant: false,
    },
    latestReleaseAt: null,
    community: null,
    repositorySizeKb: null,
    license: { status: "missing", label: "Missing", tooltip: "Missing" },
    preset: null,
    refreshedAt: "2026-07-23T00:00:00Z",
    staleSince: null,
    ...overrides,
  };
}

const grandparent = project("grandparent", "Grandparent");
const parent = project("parent", "Parent", {
  fork: {
    parentName: "Grandparent",
    parentProjectId: "grandparent",
    parentUrl: null,
    status: "published",
  },
});
const child = project("child", "Child", {
  fork: {
    parentName: "Parent",
    parentProjectId: "parent",
    parentUrl: null,
    status: "published",
  },
});
const catalog: Catalog = {
  schemaVersion: 3,
  generatedAt: "2026-07-24T00:00:00Z",
  projects: [grandparent, parent, child],
  kits: [],
};

function mockViewport(phone = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: phone && query === "(max-width: 760px)",
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

afterEach(() => {
  cleanup();
  navigation.push.mockClear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

describe("fork relationship catalog flow", () => {
  test("shows parent then child and Clear all discards relationship and filters", () => {
    mockViewport();
    window.history.replaceState(null, "", "/?q=child&frontend=sillytavern");
    render(<CatalogPage catalog={catalog} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "View relationship between Parent and Child",
      }),
    );

    expect(window.location.search).toBe(
      "?q=child&relationship=child&frontend=sillytavern",
    );
    expect(
      [...document.querySelectorAll(".project-card h2")].map(
        (heading) => heading.textContent,
      ),
    ).toEqual(["Parent", "Child"]);
    expect(
      screen.getByRole("button", {
        name: "Remove fork relationship between Parent and Child",
      }),
    ).toHaveTextContent("Fork: Parent → Child");
    expect(
      screen.queryByRole("button", { name: "Remove Search: child" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByLabelText("Active filters").querySelector(".clear-query")!,
    );
    expect(window.location.search).toBe("");
    expect(document.querySelectorAll(".project-card")).toHaveLength(3);
  });

  test("normalizes a stale shared relationship without losing preserved filters", async () => {
    mockViewport();
    window.history.replaceState(
      null,
      "",
      "/?q=child&relationship=missing&frontend=sillytavern",
    );
    render(<CatalogPage catalog={catalog} />);

    await waitFor(() =>
      expect(window.location.search).toBe("?q=child&frontend=sillytavern"),
    );
    expect(screen.getByRole("link", { name: "Child" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Remove fork relationship/ }),
    ).not.toBeInTheDocument();
  });

  test("keeps parent-first DOM order at the phone breakpoint", () => {
    mockViewport(true);
    window.history.replaceState(null, "", "/?relationship=child");
    render(<CatalogPage catalog={catalog} />);

    expect(
      [...document.querySelectorAll(".project-card h2")].map(
        (heading) => heading.textContent,
      ),
    ).toEqual(["Parent", "Child"]);
  });

  test("links to a multi-card upstream repository without choosing one sibling", () => {
    mockViewport();
    const repositoryChild = project("repository-child", "Repository Child", {
      fork: {
        parentName: "VectHare",
        parentProjectId: null,
        parentUrl: "https://github.com/Coneja-Chibi/VectHare",
        status: "repository",
      },
    });

    render(
      <CatalogPage
        catalog={{
          ...catalog,
          projects: [repositoryChild],
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Fork of VectHare" }),
    ).toHaveAttribute("href", "https://github.com/Coneja-Chibi/VectHare");
    expect(
      screen.queryByRole("button", {
        name: /View relationship between VectHare/u,
      }),
    ).not.toBeInTheDocument();
  });
});
