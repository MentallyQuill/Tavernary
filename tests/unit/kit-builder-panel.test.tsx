import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  availableBuilderHeight,
  KitBuilderPanel as ProductionKitBuilderPanel,
} from "@/features/kits/components/kit-builder-panel";
import { copyKitLink } from "@/features/kits/share-kit";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { CatalogKit } from "@/features/kits/kit-types";

const originalMatchMedia = window.matchMedia;

type TestKitBuilderPanelProps = Omit<
  ComponentProps<typeof ProductionKitBuilderPanel>,
  "now" | "onCopyLink"
> & {
  now?: string;
  onCopyLink?: (kitId: string) => void | Promise<void>;
};

function KitBuilderPanel({
  now = "2026-07-24T00:00:00.000Z",
  onCopyLink = () => undefined,
  ...props
}: TestKitBuilderPanelProps) {
  return (
    <ProductionKitBuilderPanel {...props} now={now} onCopyLink={onCopyLink} />
  );
}

function mockMatchMedia({
  phone = false,
  touchLayout = false,
}: {
  phone?: boolean;
  touchLayout?: boolean;
}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches:
        query === "(max-width: 760px)"
          ? phone
          : query === "(max-width: 1050px), (pointer: coarse)"
            ? touchLayout
            : false,
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

function fixtureProject({
  id,
  name,
  kind,
  primaryFunction,
}: Pick<
  CatalogProject,
  "id" | "name" | "kind" | "primaryFunction"
>): CatalogProject {
  return {
    id,
    name,
    kind,
    metadataStatus: "curated",
    sourceStatus: "healthy",
    primaryFunction,
    summary: `${name} summary`,
    canonicalUrl: `https://example.com/${id}`,
    catalogedAt: "2026-07-01T00:00:00.000Z",
    catalogCohort: "standard",
    frontends: [],
    capabilities: [],
    searchableText: name.toLocaleLowerCase(),
    attribution: {
      owner: "example-owner",
      contributors: [],
      humanContributorCount: 1,
      status: "current",
    },
    activity: {
      latestSourceActivityAt: "2026-07-24T00:00:00.000Z",
      activeWeeks12: 12,
      weeklyActivity: [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ],
      evidenceStatus: "complete",
      dormant: false,
    },
    latestReleaseAt: null,
    community: null,
    repositorySizeKb: null,
    license: {
      status: "osi-approved",
      label: "MIT",
      tooltip: "MIT License",
    },
    preset:
      kind === "preset"
        ? {
            version: "1.0.0",
            publishedAt: "2026-07-24T00:00:00.000Z",
            artifactSizeBytes: 1024,
            modelFamilies: [],
            completionFormats: [],
          }
        : null,
    refreshedAt: "2026-07-24T00:00:00.000Z",
    staleSince: null,
  };
}

function fixtureKit(): CatalogKit {
  return {
    id: "story-kit-41",
    title: "Story Kit",
    description: "A compact story stack.",
    author: { githubUserId: 123, login: "author" },
    sourceIssueNumber: 41,
    publishedAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    frontends: [],
    purposes: [],
    modelFamilies: [],
    components: [
      {
        projectId: "frontend",
        name: "Frontend",
        kind: "frontend",
        primaryFunction: "frontend",
        availability: "available",
        unavailableReason: null,
        canonicalUrl: "https://example.com/frontend",
        project: fixtureProject({
          id: "frontend",
          name: "Frontend",
          kind: "frontend",
          primaryFunction: "frontend",
        }),
      },
      {
        projectId: "memory",
        name: "Memory",
        kind: "extension",
        primaryFunction: "memory-retrieval",
        availability: "available",
        unavailableReason: null,
        canonicalUrl: "https://example.com/memory",
        project: fixtureProject({
          id: "memory",
          name: "Memory",
          kind: "extension",
          primaryFunction: "memory-retrieval",
        }),
      },
      {
        projectId: "preset",
        name: "Preset",
        kind: "preset",
        primaryFunction: "generation-reasoning",
        availability: "available",
        unavailableReason: null,
        canonicalUrl: "https://example.com/preset",
        project: fixtureProject({
          id: "preset",
          name: "Preset",
          kind: "preset",
          primaryFunction: "generation-reasoning",
        }),
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

function renderInspectPanel() {
  return render(
    <KitBuilderPanel
      state={{ mode: "inspect", collapsed: false, kitId: "story-kit-41" }}
      kit={fixtureKit()}
      now="2026-07-24T00:00:00.000Z"
      onCopyLink={() => undefined}
      onCollapse={() => undefined}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

beforeEach(() => mockMatchMedia({}));

describe("Kit Builder", () => {
  test("explains inspect-mode Copy link on hover and focus", async () => {
    renderInspectPanel();
    const copy = screen.getByRole("button", { name: "Copy link" });

    await userEvent.hover(copy);
    expect(
      screen.getByRole("tooltip", {
        name: "Copy a direct link to this Kit",
      }),
    ).toBeVisible();
  });

  test("keeps phone entry browse-first but opens explicit inspections", () => {
    mockMatchMedia({ phone: true, touchLayout: true });
    const { rerender } = render(
      <KitBuilderPanel
        state={{ mode: "intro", collapsed: false }}
        kit={null}
        onCollapse={() => undefined}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Kit Builder/ }),
    ).not.toBeInTheDocument();

    rerender(
      <KitBuilderPanel
        state={{ mode: "inspect", collapsed: false, kitId: "story-kit-41" }}
        kit={fixtureKit()}
        onCollapse={() => undefined}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Kit Builder" })).toBeVisible();

    rerender(
      <KitBuilderPanel
        state={{ mode: "inspect", collapsed: false, kitId: "missing" }}
        kit={null}
        onCollapse={() => undefined}
      />,
    );
    expect(screen.getByText("Unknown Kit")).toBeVisible();
  });

  test("retains the desktop introductory workspace", () => {
    mockMatchMedia({});
    render(
      <KitBuilderPanel
        state={{ mode: "intro", collapsed: false }}
        kit={null}
        onCollapse={() => undefined}
      />,
    );

    expect(
      screen.getByRole("complementary", { name: "Kit Builder" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Create new Kit" })).toHaveClass(
      "control-primary",
    );
  });

  test("opens a discard confirmation from the Build-mode heading", async () => {
    mockMatchMedia({});
    const user = userEvent.setup();
    render(
      <KitBuilderPanel
        state={{
          mode: "build",
          collapsed: false,
          dirty: true,
          draft: {
            operation: "create",
            kitId: null,
            title: "Work in progress",
            description: "",
            projectIds: [],
          },
        }}
        kit={null}
        onCollapse={() => undefined}
        onDiscardDraft={() => undefined}
      />,
    );

    const discard = screen.getByRole("button", { name: "Discard draft" });
    expect(discard.querySelector('[data-icon="remove"]')).not.toBeNull();
    await user.click(discard);

    const confirmation = screen.getByRole("dialog", {
      name: "Discard unfinished Kit?",
    });
    expect(confirmation).toHaveTextContent(
      "This removes your saved draft and cannot be undone.",
    );
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Discard Kit" })).toBeVisible();
  });

  test("Escape closes only the discard confirmation on phones", async () => {
    mockMatchMedia({ phone: true, touchLayout: true });
    const onCollapse = vi.fn();
    const user = userEvent.setup();
    render(
      <KitBuilderPanel
        state={{
          mode: "build",
          collapsed: false,
          dirty: true,
          draft: {
            operation: "create",
            kitId: null,
            title: "Work in progress",
            description: "",
            projectIds: [],
          },
        }}
        kit={null}
        onCollapse={onCollapse}
        onDiscardDraft={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "Discard unfinished Kit?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Kit Builder" })).toBeVisible();
    expect(onCollapse).not.toHaveBeenCalled();
  });

  test("renders a readable desktop Kit Builder rail", () => {
    mockMatchMedia({});
    render(
      <KitBuilderPanel
        state={{ mode: "intro", collapsed: true }}
        kit={null}
        onCollapse={() => undefined}
      />,
    );

    const open = screen.getByRole("button", { name: "Open Kit Builder" });
    expect(open).toHaveClass("kit-builder-toggle");
    expect(open).not.toHaveClass("kit-builder-rail");
    expect(open.closest(".kit-builder-rail")).toHaveTextContent("Kit Builder");
    expect(open.querySelector('[data-icon="kit-builder"]')).not.toBeNull();
    fireEvent.pointerEnter(open);
    expect(
      screen.getByRole("tooltip", { name: "Open Kit Builder" }),
    ).toBeVisible();
  });

  test("calculates the visible desktop builder height from its current top edge", () => {
    expect(availableBuilderHeight(900, 116)).toBe(784);
    expect(availableBuilderHeight(900, 0)).toBe(900);
    expect(availableBuilderHeight(900, -80)).toBe(900);
  });

  test("uses a horizontal draft pill only for collapsed phone builds", async () => {
    mockMatchMedia({ phone: true, touchLayout: true });
    const user = userEvent.setup();
    const onCollapse = vi.fn();
    const { rerender } = render(
      <KitBuilderPanel
        state={{
          mode: "build",
          collapsed: true,
          dirty: true,
          draft: {
            operation: "create",
            kitId: null,
            title: "",
            description: "",
            projectIds: ["one", "two", "three"],
          },
        }}
        kit={null}
        onCollapse={onCollapse}
      />,
    );

    const pill = screen.getByRole("button", {
      name: "Open Kit Builder, 3 projects in draft",
    });
    expect(pill).toHaveClass("kit-draft-pill");
    await user.click(pill);
    expect(onCollapse).toHaveBeenCalledOnce();

    rerender(
      <KitBuilderPanel
        state={{ mode: "inspect", collapsed: true, kitId: "story-kit-41" }}
        kit={fixtureKit()}
        onCollapse={onCollapse}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /projects in draft/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Kit Builder" }),
    ).not.toBeInTheDocument();
  });

  test("keeps the readable rail on touch tablets", () => {
    mockMatchMedia({ touchLayout: true });
    render(
      <KitBuilderPanel
        state={{
          mode: "build",
          collapsed: true,
          dirty: true,
          draft: {
            operation: "create",
            kitId: null,
            title: "",
            description: "",
            projectIds: ["one", "two"],
          },
        }}
        kit={null}
        onCollapse={() => undefined}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Open Kit Builder, 2 projects in draft",
      }),
    ).toHaveClass("kit-builder-toggle");
  });

  test("can hide phone draft access while the selection dock is active", () => {
    mockMatchMedia({ phone: true, touchLayout: true });
    render(
      <KitBuilderPanel
        state={{
          mode: "build",
          collapsed: true,
          dirty: true,
          draft: {
            operation: "create",
            kitId: null,
            title: "",
            description: "",
            projectIds: ["one"],
          },
        }}
        kit={null}
        onCollapse={() => undefined}
        hidePhoneDraftAccess
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Open Kit Builder/ }),
    ).not.toBeInTheDocument();
  });

  test("reveals the phone draft pill after the builder sheet exits", () => {
    mockMatchMedia({ phone: true, touchLayout: true });
    vi.useFakeTimers();
    const buildState = {
      mode: "build" as const,
      dirty: true,
      draft: {
        operation: "create" as const,
        kitId: null,
        title: "",
        description: "",
        projectIds: [],
      },
    };
    const { rerender } = render(
      <KitBuilderPanel
        state={{ ...buildState, collapsed: false }}
        kit={null}
        onCollapse={() => undefined}
      />,
    );

    rerender(
      <KitBuilderPanel
        state={{ ...buildState, collapsed: true }}
        kit={null}
        onCollapse={() => undefined}
      />,
    );
    act(() => vi.advanceTimersByTime(220));
    expect(
      screen.getByRole("button", {
        name: "Open Kit Builder, 0 projects in draft",
      }),
    ).toBeVisible();
  });

  test("keeps the phone sheet and inert background through its exit", () => {
    mockMatchMedia({ phone: true, touchLayout: true });
    vi.useFakeTimers();

    function Harness() {
      const [collapsed, setCollapsed] = useState(false);
      return (
        <>
          <main className="catalog-main">
            <button type="button">Catalog action</button>
          </main>
          <KitBuilderPanel
            state={{
              mode: "inspect",
              collapsed,
              kitId: "story-kit-41",
            }}
            kit={fixtureKit()}
            onCollapse={() => setCollapsed(true)}
          />
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByRole("main")).toHaveAttribute("inert");
    fireEvent.click(screen.getByRole("button", { name: "Close Kit Builder" }));
    expect(screen.getByRole("dialog", { name: "Kit Builder" })).toHaveAttribute(
      "data-motion-phase",
      "exiting",
    );
    expect(screen.getByRole("main")).toHaveAttribute("inert");
    act(() => vi.advanceTimersByTime(220));
    expect(
      screen.queryByRole("dialog", { name: "Kit Builder" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
  });

  test("names the expanded surface Kit Builder", async () => {
    mockMatchMedia({});
    const user = userEvent.setup();
    const onCollapse = vi.fn();
    render(
      <KitBuilderPanel
        state={{ mode: "intro", collapsed: false }}
        kit={null}
        onCollapse={onCollapse}
      />,
    );
    expect(
      screen.getByRole("complementary", { name: "Kit Builder" }),
    ).toBeVisible();
    expect(screen.getByText("Build and inspect Kits")).toBeVisible();
    const collapse = screen.getByRole("button", {
      name: "Collapse Kit Builder",
    });
    expect(collapse).toHaveClass(
      "control-icon",
      "kit-builder-toggle",
      "kit-builder-collapse",
    );
    expect(collapse.querySelector('[data-icon="kit-builder"]')).not.toBeNull();
    fireEvent.pointerEnter(collapse);
    expect(
      screen.getByRole("tooltip", { name: "Collapse Kit Builder" }),
    ).toBeVisible();
    await user.click(collapse);
    expect(onCollapse).toHaveBeenCalled();
  });

  test("shows unknown Kit states", () => {
    render(
      <KitBuilderPanel
        state={{ mode: "inspect", collapsed: false, kitId: "missing" }}
        kit={null}
        onCollapse={() => undefined}
      />,
    );
    expect(screen.getByText("Unknown Kit")).toBeVisible();
  });

  test("links available projects directly and keeps flagged projects noninteractive", () => {
    render(
      <KitBuilderPanel
        state={{ mode: "inspect", collapsed: false, kitId: "story-kit-41" }}
        kit={fixtureKit()}
        onCollapse={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Story Kit" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Frontend" })).toHaveAttribute(
      "href",
      "https://example.com/frontend",
    );
    expect(screen.getByRole("link", { name: "Memory" })).toHaveAttribute(
      "href",
      "https://example.com/memory",
    );
    expect(screen.getByRole("link", { name: "Preset" })).toHaveAttribute(
      "href",
      "https://example.com/preset",
    );
    expect(screen.queryByText("project details")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-expanded]")).toBeNull();
    expect(screen.getByText("safety-review")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Flagged" }),
    ).not.toBeInTheDocument();
  });

  test("renders a Kit-card-aligned inspect summary and accessible project list", () => {
    renderInspectPanel();

    const summary = document.querySelector(".kit-builder-inspect-summary");
    expect(summary).not.toBeNull();
    expect(summary?.querySelector("svg")).not.toBeNull();
    expect(
      within(summary as HTMLElement).getByRole("heading", {
        name: "Story Kit",
      }),
    ).toBeVisible();
    expect(within(summary as HTMLElement).getByText("@author")).toBeVisible();
    expect(
      within(summary as HTMLElement).queryByText("4 Projects"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Projects" })).toHaveClass(
      "kit-project-list-heading",
    );
    expect(screen.getByText("1 Preset · 2 Extensions")).toHaveClass(
      "kit-project-kind-summary",
    );
    expect(screen.getByRole("list", { name: "Kit projects" })).toHaveClass(
      "kit-project-stack",
    );
  });

  test("omits Frontend and zero-count kinds from the project breakdown", () => {
    const kit = fixtureKit();
    const preset = kit.components.find(
      (component) => component.kind === "preset",
    );
    expect(preset).toBeDefined();
    kit.components = [
      kit.components[0],
      preset!,
      {
        ...preset!,
        projectId: "second-preset",
        name: "Second Preset",
      },
    ];

    render(
      <KitBuilderPanel
        state={{ mode: "inspect", collapsed: false, kitId: kit.id }}
        kit={kit}
        onCollapse={() => undefined}
      />,
    );

    const breakdown = document.querySelector(".kit-project-kind-summary");
    expect(breakdown).toHaveTextContent("2 Presets");
    expect(breakdown).not.toHaveTextContent(/Extension|Frontend/);
  });

  test("exposes truthful desktop inspector scroll boundaries", () => {
    renderInspectPanel();
    const body = document.querySelector<HTMLElement>(".kit-builder-panel-body");
    const frame = document.querySelector<HTMLElement>(
      ".kit-builder-panel-body-frame",
    );
    expect(body).not.toBeNull();
    expect(frame).not.toBeNull();

    Object.defineProperties(body!, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    fireEvent.scroll(body!);
    expect(frame).not.toHaveAttribute("data-can-scroll-up");
    expect(frame).toHaveAttribute("data-can-scroll-down", "true");

    body!.scrollTop = 600;
    fireEvent.scroll(body!);
    expect(frame).toHaveAttribute("data-can-scroll-up", "true");
    expect(frame).not.toHaveAttribute("data-can-scroll-down");
  });

  test("maps every inspect action to a visible control treatment", () => {
    renderInspectPanel();

    for (const name of ["Duplicate", "Edit", "Copy link"]) {
      expect(screen.getByRole("button", { name })).toHaveClass(
        "control-secondary",
        "kit-preview-action",
      );
    }
    expect(screen.getByRole("link", { name: "Report Kit" })).toHaveClass(
      "control-secondary",
      "kit-preview-action",
    );
    expect(
      screen.getByRole("link", { name: "Request withdrawal" }),
    ).toHaveClass(
      "control-secondary",
      "kit-preview-action",
      "kit-withdrawal-action",
    );
    expect(
      screen
        .getByRole("button", { name: "Duplicate" })
        .querySelector('[data-kit-preview-icon="duplicate"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Copy link" })
        .querySelector('[data-kit-preview-icon="copy-link"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Report Kit" })
        .querySelector('[data-kit-preview-icon="report"]'),
    ).not.toBeNull();
  });

  test("preserves the current phone inspect summary", () => {
    mockMatchMedia({ phone: true, touchLayout: true });
    render(
      <KitBuilderPanel
        state={{ mode: "inspect", collapsed: false, kitId: "story-kit-41" }}
        kit={fixtureKit()}
        now="2026-07-24T00:00:00.000Z"
        onCopyLink={() => undefined}
        onCollapse={() => undefined}
      />,
    );

    expect(document.querySelector(".kit-builder-inspect-heading")).toBeNull();
    expect(screen.getByRole("heading", { name: "Story Kit" })).toBeVisible();
    expect(screen.getByText("@author")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Projects" })).toHaveClass(
      "kit-project-list-heading",
    );
    expect(screen.getByText("1 Preset · 2 Extensions")).toHaveClass(
      "kit-project-kind-summary",
    );
    expect(document.querySelector(".kit-project-count-tag")).toBeNull();
  });

  test("delegates inspect-mode copying and preserves action URLs", async () => {
    const onCopyLink = vi.fn();
    render(
      <KitBuilderPanel
        state={{ mode: "inspect", collapsed: false, kitId: "story-kit-41" }}
        kit={fixtureKit()}
        now="2026-07-24T00:00:00.000Z"
        onCopyLink={onCopyLink}
        onCollapse={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(onCopyLink).toHaveBeenCalledWith("story-kit-41");
    expect(screen.queryByRole("textbox", { name: "Kit link" })).toBeNull();
    expect(screen.getByRole("link", { name: "Report Kit" })).toHaveAttribute(
      "href",
      expect.stringContaining("kit-id=story-kit-41"),
    );
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
