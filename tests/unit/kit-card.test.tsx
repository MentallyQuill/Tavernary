import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { KitCard } from "@/features/kits/components/kit-card";
import type { CatalogKit } from "@/features/kits/kit-types";

const label = (id: string) => ({ id, label: id, description: id });

function kit(overrides: Partial<CatalogKit> = {}): CatalogKit {
  return {
    id: "long-form-storyteller-41",
    title: "Long-Form Storyteller",
    description: "A durable narrative stack.",
    author: { githubUserId: 123, login: "example-author" },
    sourceIssueNumber: 41,
    publishedAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    tavernaryPick: false,
    frontends: [label("sillytavern")],
    purposes: [label("memory-retrieval")],
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

afterEach(cleanup);

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
    expect(screen.getByText("12 supporters")).toBeVisible();
    expect(screen.getByText("8 projects")).toBeVisible();
    expect(screen.getByText("Published 2d ago")).toBeVisible();
    const open = screen.getByRole("button", {
      name: "Open Long-Form Storyteller",
    });
    expect(open).toHaveAttribute("aria-controls", "kit-workspace");
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Report Kit" })).toBeVisible();

    await user.click(open);
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    await user.click(screen.getByRole("button", { name: "Report Kit" }));
    expect(onSelect).toHaveBeenCalledWith("long-form-storyteller-41");
    expect(onCopyLink).toHaveBeenCalledWith("long-form-storyteller-41");
    expect(onReport).toHaveBeenCalledWith("long-form-storyteller-41");
  });

  test("shows unavailable support, update, Pick, and caution states", () => {
    render(
      <KitCard
        kit={kit({
          supporterCount: null,
          updatedAt: "2026-07-23T00:00:00.000Z",
          tavernaryPick: true,
          flaggedProjectCount: 2,
        })}
        now="2026-07-24T00:00:00.000Z"
        selected
        onSelect={() => undefined}
        onCopyLink={() => undefined}
        onReport={() => undefined}
      />,
    );

    expect(screen.getByText("Support unavailable")).toBeVisible();
    expect(screen.getByText("Updated 1d ago")).toBeVisible();
    expect(screen.getByText("Tavernary Pick")).toBeVisible();
    expect(screen.getByText("Contains flagged projects")).toBeVisible();
  });
});
