import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { KitCard } from "@/features/kits/components/kit-card";
import type { CatalogKit } from "@/features/kits/kit-types";

const label = (id: string) => ({ id, label: id, description: id });
const originalMatchMedia = window.matchMedia;

function mockMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function kit(overrides: Partial<CatalogKit> = {}): CatalogKit {
  return {
    id: "long-form-storyteller-41",
    title: "Long-Form Storyteller",
    description: "A durable narrative stack.",
    author: { githubUserId: 123, login: "example-author" },
    sourceIssueNumber: 41,
    sourceIssueUrl: "https://github.com/fixture/catalog/issues/41",
    publishedAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    frontends: [label("sillytavern")],
    purposes: [label("memory-retrieval")],
    modelFamilies: [],
    components: Array.from({ length: 8 }, (_, index) => ({
      projectId: `project-${index}`,
      name: `Project ${index}`,
      kind: index === 0 ? ("frontend" as const) : ("extension" as const),
      primaryFunction: index === 0 ? "frontend" : "generation-reasoning",
      availability: "available" as const,
      unavailableReason: null,
      canonicalUrl: `https://example.com/${index}`,
      project: null,
    })),
    supporterCount: 12,
    trendingScore: 9,
    supportRefreshedAt: "2026-07-24T00:00:00.000Z",
    supportStale: false,
    flaggedProjectCount: 0,
    searchableText: "long form storyteller example author",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

beforeEach(mockMatchMedia);

function renderCard(value: CatalogKit = kit()) {
  return render(
    <KitCard
      kit={value}
      now="2026-07-24T00:00:00.000Z"
      selected={false}
      onSelect={() => undefined}
      onCopyLink={() => undefined}
      onReport={() => undefined}
    />,
  );
}

describe("Kit card", () => {
  test("renders compact metadata and sibling actions", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCopyLink = vi.fn();
    const onReport = vi.fn();
    render(
      <KitCard
        kit={kit()}
        now="2026-07-24T00:00:00.000Z"
        selected={false}
        onSelect={onSelect}
        onCopyLink={onCopyLink}
        onReport={onReport}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Long-Form Storyteller" }),
    ).toBeVisible();
    expect(screen.getByText("@example-author")).toBeVisible();
    expect(screen.getByText("12")).toHaveClass("kit-upvote-count");
    expect(screen.queryByText(/supporters?/i)).not.toBeInTheDocument();
    const count = screen.getByText("8 Projects");
    expect(count).toHaveClass("kit-project-count-tag");
    expect(screen.queryByText("8 projects")).not.toBeInTheDocument();
    expect(screen.getByText("Published 2d ago")).toBeVisible();
    const open = screen.getByRole("button", {
      name: "Open Long-Form Storyteller",
    });
    expect(open).toHaveAttribute("aria-controls", "kit-builder-panel");
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Report Kit" })).toBeVisible();

    await user.click(open);
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    await user.click(screen.getByRole("button", { name: "Report Kit" }));
    expect(onSelect).toHaveBeenCalledWith("long-form-storyteller-41");
    expect(onCopyLink).toHaveBeenCalledWith("long-form-storyteller-41");
    expect(onReport).toHaveBeenCalledWith("long-form-storyteller-41");
  });

  test("shows unavailable support, update, and caution states without editorial badges", () => {
    render(
      <KitCard
        kit={kit({
          supporterCount: null,
          updatedAt: "2026-07-23T00:00:00.000Z",
          flaggedProjectCount: 2,
        })}
        now="2026-07-24T00:00:00.000Z"
        selected
        onSelect={() => undefined}
        onCopyLink={() => undefined}
        onReport={() => undefined}
      />,
    );

    expect(screen.queryByText("Support unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText(/supporter/)).not.toBeInTheDocument();
    expect(screen.getByText("Updated 1d ago")).toBeVisible();
    expect(screen.queryByText("Tavernary Pick")).not.toBeInTheDocument();
    expect(screen.getByText("Contains flagged projects")).toBeVisible();
  });

  test("uses singular project count copy", () => {
    renderCard(kit({ components: [kit().components[0]] }));
    expect(screen.getByText("1 Project")).toHaveClass("kit-project-count-tag");
  });

  test.each([
    { supporterCount: 0, visibleCount: "0" },
    { supporterCount: null, visibleCount: null },
  ])(
    "renders support value $supporterCount without a label",
    ({ supporterCount, visibleCount }) => {
      renderCard(kit({ supporterCount }));

      if (visibleCount === null) {
        expect(
          document.querySelector(".kit-upvote-count"),
        ).not.toBeInTheDocument();
      } else {
        expect(screen.getByText(visibleCount)).toHaveClass("kit-upvote-count");
      }
      expect(screen.queryByText(/supporters?|votes?/i)).not.toBeInTheDocument();
    },
  );

  test("links the upvote arrow to the canonical GitHub issue without selecting the Kit", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <KitCard
        kit={kit({
          sourceIssueNumber: 241,
          sourceIssueUrl: "https://github.com/fixture/catalog/issues/241",
          supporterCount: 12,
        })}
        now="2026-07-24T00:00:00.000Z"
        selected={false}
        onSelect={onSelect}
        onCopyLink={() => undefined}
        onReport={() => undefined}
      />,
    );

    const upvote = screen.getByRole("link", { name: "Upvote on GitHub" });
    expect(upvote).toHaveAttribute(
      "href",
      "https://github.com/fixture/catalog/issues/241",
    );
    const supporterCount = screen.getByText("12");
    expect(supporterCount).toHaveClass("kit-upvote-count");
    expect(supporterCount.parentElement).toContainElement(upvote);
    expect(screen.queryByText(/supporters?/i)).not.toBeInTheDocument();
    expect(upvote).toHaveAttribute("target", "_blank");
    expect(upvote).toHaveAttribute("rel", "noopener noreferrer");
    expect(upvote).not.toHaveAttribute("aria-pressed");
    expect(upvote).toHaveClass("project-kit-control", "kit-upvote-control");

    const glyph = upvote.querySelector('[data-kit-glyph="upvote"]');
    expect(glyph).toHaveAttribute("viewBox", "0 0 24 24");
    expect(glyph).toHaveAttribute("fill", "currentColor");
    expect(glyph?.querySelector("path")).toHaveAttribute(
      "d",
      "M4 14h4v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7h4a1.001 1.001 0 0 0 .781-1.625l-8-10c-.381-.475-1.181-.475-1.562 0l-8 10A1.001 1.001 0 0 0 4 14z",
    );

    await user.click(upvote);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("explains Copy link and Report on hover and focus", async () => {
    const user = userEvent.setup();
    renderCard(kit());

    const copy = screen.getByRole("button", { name: "Copy link" });
    await user.hover(copy);
    expect(
      screen.getByRole("tooltip", {
        name: "Copy a direct link to this Kit",
      }),
    ).toBeVisible();

    await user.unhover(copy);
    const report = screen.getByRole("button", { name: "Report Kit" });
    report.focus();
    await waitFor(() => {
      expect(
        screen.getByRole("tooltip", { name: "Report this Kit on GitHub" }),
      ).toBeVisible();
    });

    const upvote = screen.getByRole("link", { name: "Upvote on GitHub" });
    await user.hover(upvote);
    expect(
      screen.getByRole("tooltip", { name: "Upvote on GitHub" }),
    ).toBeVisible();
  });
});
