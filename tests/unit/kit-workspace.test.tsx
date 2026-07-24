import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { KitWorkspace } from "@/features/kits/components/kit-workspace";
import { copyKitLink } from "@/features/kits/share-kit";
import type { CatalogKit } from "@/features/kits/kit-types";

function fixtureKit(): CatalogKit {
  return {
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
    components: [
      {
        projectId: "frontend",
        name: "Frontend",
        kind: "frontend",
        primaryFunction: "frontend",
        availability: "available",
        unavailableReason: null,
        canonicalUrl: "https://example.com/frontend",
        project: null,
      },
      {
        projectId: "memory",
        name: "Memory",
        kind: "extension",
        primaryFunction: "memory-retrieval",
        availability: "available",
        unavailableReason: null,
        canonicalUrl: "https://example.com/memory",
        project: null,
      },
      {
        projectId: "preset",
        name: "Preset",
        kind: "preset",
        primaryFunction: "generation-reasoning",
        availability: "available",
        unavailableReason: null,
        canonicalUrl: "https://example.com/preset",
        project: null,
      },
      {
        projectId: "flagged",
        name: "Flagged",
        kind: "extension",
        primaryFunction: "generation-reasoning",
        availability: "flagged",
        unavailableReason: "safety-review",
        canonicalUrl: null,
        project: null,
      },
    ],
    supporterCount: null,
    trendingScore: null,
    supportRefreshedAt: null,
    supportStale: false,
    flaggedProjectCount: 1,
    searchableText: "story kit author",
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Kit workspace", () => {
  test("shows intro, collapse, and unknown Kit states", async () => {
    const user = userEvent.setup();
    const onCollapse = vi.fn();
    const { rerender } = render(
      <KitWorkspace
        state={{ mode: "intro", collapsed: false }}
        kit={null}
        onCollapse={onCollapse}
      />,
    );
    expect(
      screen.getByRole("complementary", { name: "Kit workspace" }),
    ).toBeVisible();
    expect(screen.getByText("Build and inspect Kits")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Collapse workspace" }),
    );
    expect(onCollapse).toHaveBeenCalled();

    rerender(
      <KitWorkspace
        state={{ mode: "inspect", collapsed: false, kitId: "missing" }}
        kit={null}
        onCollapse={onCollapse}
      />,
    );
    expect(screen.getByText("Unknown Kit")).toBeVisible();
  });

  test("expands one project at a time and disables flagged rows", async () => {
    const user = userEvent.setup();
    render(
      <KitWorkspace
        state={{ mode: "inspect", collapsed: false, kitId: "story-kit-41" }}
        kit={fixtureKit()}
        onCollapse={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Story Kit" })).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /project details/i }),
    ).toHaveLength(3);
    await user.click(
      screen.getByRole("button", { name: "Memory project details" }),
    );
    expect(screen.getByRole("link", { name: "Memory" })).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Preset project details" }),
    );
    expect(
      screen.queryByRole("link", { name: "Memory" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("safety-review")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Flagged" }),
    ).not.toBeInTheDocument();
  });

  test("copies links with selectable fallback and prefilled action URLs", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const share = vi.fn();
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    window.history.replaceState(null, "", "/Tavernary/");
    render(
      <KitWorkspace
        state={{ mode: "inspect", collapsed: false, kitId: "story-kit-41" }}
        kit={fixtureKit()}
        onCollapse={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    const fallback = screen.getByRole("textbox", {
      name: "Kit link",
    }) as HTMLInputElement;
    expect(fallback.value).toContain("/Tavernary/?mode=kits&kit=story-kit-41");
    expect(fallback.selectionStart).toBe(0);
    expect(fallback.selectionEnd).toBe(fallback.value.length);
    expect(screen.getByRole("link", { name: "Report Kit" })).toHaveAttribute(
      "href",
      expect.stringContaining("kit-id=story-kit-41"),
    );
    expect(
      screen.getByRole("link", { name: "Request withdrawal" }),
    ).toHaveAttribute("href", expect.stringContaining("story-kit-41"));
    expect(share).not.toHaveBeenCalled();
  });
});

test("copyKitLink reports clipboard success without Web Share", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const share = vi.fn();
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
  window.history.replaceState(null, "", "/?mode=kits");

  await expect(copyKitLink("story-kit-41")).resolves.toBe("copied");
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining("mode=kits&kit=story-kit-41"),
  );
  expect(share).not.toHaveBeenCalled();
});
