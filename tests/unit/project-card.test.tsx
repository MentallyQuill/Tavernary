import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ProjectCard } from "@/features/catalog/components/project-card";
import { ProjectGrid } from "@/features/catalog/components/project-grid";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { ProjectSelectionBindings } from "@/features/kits/use-project-batch-selection";
import { catalogSearchFields } from "../helpers/catalog-search-fields";

const originalMatchMedia = window.matchMedia;

function project(
  id: string,
  overrides: Partial<CatalogProject> = {},
): CatalogProject {
  return {
    id,
    name: id,
    kind: "extension",
    metadataStatus: "curated",
    sourceStatus: "healthy",
    primaryFunction: "generation-reasoning",
    summary: `${id} summary`,
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
    tags: [
      {
        id: "automate-roleplay-workflows",
        label: "Automate roleplay workflows",
        description: "Automates roleplay tasks.",
        facet: "goal",
      },
    ],
    search: catalogSearchFields(id),
    fork: null,
    attribution: null,
    activity: {
      latestSourceActivityAt: "2026-07-20T00:00:00Z",
      activeWeeks12: 4,
      weeklyActivity: [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
        true,
      ],
      evidenceStatus: "complete",
      dormant: false,
    },
    latestReleaseAt: null,
    community: { stars: 10, forks: 2, watchers: 1, aggregate: 13 },
    repositorySizeKb: 100,
    license: {
      status: "osi-approved",
      label: "MIT",
      tooltip: "Open source",
    },
    preset: null,
    refreshedAt: "2026-07-23T00:00:00Z",
    staleSince: null,
    ...overrides,
    tavernKeeper: overrides.tavernKeeper ?? null,
  };
}

describe("project card", () => {
  test.afterEach(() => {
    cleanup();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  test("renders only useful search evidence visually and accessibly", () => {
    const evidence = [
      {
        field: "maintainers" as const,
        value: "MentallyQuill",
        kind: "exact" as const,
        queryTerm: "mentallyquill",
        matchedTerm: "mentallyquill",
      },
    ];
    const { rerender } = render(
      <ProjectCard
        project={project("directive", { name: "Directive" })}
        now="2026-07-24T00:00:00Z"
        searchEvidence={evidence}
      />,
    );
    const card = screen.getByRole("link", { name: "Directive" });

    expect(screen.getByText("Matched maintainer:")).toBeVisible();
    expect(card).toHaveAccessibleDescription(
      /Matched maintainer: MentallyQuill/u,
    );

    rerender(
      <ProjectCard
        project={project("directive", { name: "Directive" })}
        now="2026-07-24T00:00:00Z"
        searchEvidence={[
          {
            ...evidence[0],
            field: "title",
            value: "Directive",
            queryTerm: "directive",
            matchedTerm: "directive",
          },
        ]}
      />,
    );
    expect(screen.queryByText(/Matched/u)).not.toBeInTheDocument();
    expect(card).not.toHaveAccessibleDescription(/Matched/u);
  });

  test("keeps the scan indicator beside the repository title outside its link", () => {
    const { container } = render(
      <ProjectCard
        project={project("scan-indicator-card", {
          name: "A Very Long Project Name",
          tavernKeeper: {
            state: "teal",
            reason: "current",
            currentSha: "a".repeat(40),
            report: {
              reportId: "report-1",
              result: "teal",
              scannedSha: "a".repeat(40),
              scannedAt: "2026-07-31T00:00:00Z",
              mode: "standard",
              scannerPolicyVersion: "1",
              reportUrl: "https://example.com/tavernkeeper/report-1",
              historyUrl: "https://example.com/tavernkeeper/history",
              severity: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
                info: 0,
              },
            },
            history: [],
            historyUrl: "https://example.com/tavernkeeper/history",
          },
        })}
        now="2026-07-23T00:00:00Z"
      />,
    );

    const card = container.querySelector("article.project-card");
    const title = screen.getByRole("heading", {
      name: "A Very Long Project Name",
    });
    const link = screen.getByRole("link", { name: "A Very Long Project Name" });
    const indicator = screen.getByRole("button", {
      name: /TavernKeeper scan/u,
    });

    expect(card).toContainElement(link);
    expect(card).toContainElement(indicator);
    expect(card).toHaveAttribute("aria-describedby", expect.any(String));
    expect(link).not.toContainElement(indicator);
    expect([
      ...(card?.querySelector(".card-title-row")?.children ?? []),
    ]).toEqual([title, indicator]);
    expect(title).toContainElement(link);
    expect(link.querySelector(".card-title")).toHaveTextContent(
      "A Very Long Project Name",
    );
  });

  test("renders a published upstream as a sibling relationship action", () => {
    const onViewRelationship = vi.fn();
    const child = project("vectfox", {
      name: "VectFox",
      fork: {
        parentName: "VectHare",
        parentProjectId: "vecthare",
        parentUrl: null,
        status: "published",
      },
    });
    const { container } = render(
      <ProjectGrid
        projects={[child]}
        now="2026-07-23T00:00:00Z"
        relationshipChildId=""
        onViewRelationship={onViewRelationship}
        selection={{
          bindingsFor: () => ({
            state: "available",
            disabled: false,
            disabledReason: null,
            onActivate: vi.fn(),
          }),
        }}
      />,
    );

    const shell = container.querySelector(".project-card-shell");
    const repositoryLink = screen.getByRole("link", { name: "VectFox" });
    const relationshipButton = screen.getByRole("button", {
      name: "View relationship between VectHare and VectFox",
    });
    const relationshipControl = shell?.querySelector(
      ".project-relationship-control",
    );
    expect(relationshipControl?.children[0]).toHaveClass("license");
    expect(relationshipControl?.children[0]).toHaveTextContent("MIT");
    expect(relationshipControl?.children[1]).toHaveTextContent("·");
    expect(relationshipControl?.children[2]).toBe(relationshipButton);
    expect(relationshipButton).toHaveTextContent("Fork of VectHare");
    expect(screen.queryByText("View relationship")).not.toBeInTheDocument();
    expect(
      repositoryLink.querySelector(".card-utility .license"),
    ).not.toBeInTheDocument();
    expect(repositoryLink).not.toContainElement(relationshipButton);
    expect(relationshipButton.parentElement?.parentElement).toBe(shell);

    fireEvent.click(relationshipButton);
    expect(onViewRelationship).toHaveBeenCalledWith("vectfox");
  });

  test("keeps delisted upstream provenance static and private", () => {
    render(
      <ProjectGrid
        projects={[
          project("vectfox", {
            name: "VectFox",
            fork: {
              parentName: "VectHare",
              parentProjectId: null,
              parentUrl: null,
              status: "not-listed",
            },
          }),
        ]}
        now="2026-07-23T00:00:00Z"
        relationshipChildId=""
        onViewRelationship={vi.fn()}
        selection={{
          bindingsFor: () => ({
            state: "available",
            disabled: false,
            disabledReason: null,
            onActivate: vi.fn(),
          }),
        }}
      />,
    );

    expect(screen.getByText("Fork of VectHare")).toBeVisible();
    expect(screen.getByText("Upstream not listed")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /relationship/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "VectHare" })).toBeNull();
  });

  test("omits the redundant child action while preserving a forked parent's upward action", () => {
    const onViewRelationship = vi.fn();
    const parent = project("parent", {
      name: "Parent",
      fork: {
        parentName: "Grandparent",
        parentProjectId: "grandparent",
        parentUrl: null,
        status: "published",
      },
    });
    const child = project("child", {
      name: "Child",
      fork: {
        parentName: "Parent",
        parentProjectId: "parent",
        parentUrl: null,
        status: "published",
      },
    });
    render(
      <ProjectGrid
        projects={[parent, child]}
        now="2026-07-23T00:00:00Z"
        relationshipChildId="child"
        onViewRelationship={onViewRelationship}
        selection={{
          bindingsFor: () => ({
            state: "available",
            disabled: false,
            disabledReason: null,
            onActivate: vi.fn(),
          }),
        }}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "View relationship between Grandparent and Parent",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "View relationship between Parent and Child",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Fork of Parent")).toBeVisible();
  });

  test.each([
    ["SillyTavern ReMemory", "ReMemory"],
    ["sillytavern-Namegen", "Namegen"],
    ["SillyTavern_Extension Mermaid", "Extension Mermaid"],
    ["RPG Tracker for SillyTavern", "RPG Tracker for SillyTavern"],
    ["datacat SillyTavern Browser", "datacat SillyTavern Browser"],
    ["SillyTavern", "SillyTavern"],
  ])(
    "displays %s as %s without changing non-leading occurrences",
    (name, expectedName) => {
      render(
        <ProjectCard
          project={project("display-name", { name })}
          now="2026-07-23T00:00:00Z"
        />,
      );

      const card = screen.getByRole("link", { name: expectedName });
      expect(card.querySelector(".card-title")).toHaveTextContent(expectedName);
    },
  );

  test("shows creator attribution and discloses every contributor on hover", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    render(
      <ProjectCard
        project={project("directive", {
          name: "Directive",
          attribution: {
            owner: { provider: "github", login: "MentallyQuill" },
            contributors: [
              { provider: "github", login: "Alice", botOrAi: false },
              { provider: "github", login: "Claude", botOrAi: true },
            ],
            humanContributorCount: 1,
            status: "current",
          },
        })}
        now="2026-07-23T00:00:00Z"
      />,
    );

    const link = screen.getByRole("link", { name: "Directive" });
    const card = link.closest("article.project-card");
    const attribution = card?.querySelector(".card-attribution");
    expect(attribution).toHaveTextContent(
      "by MentallyQuill, plus 1 contributor",
    );
    expect(attribution).not.toHaveAttribute("tabindex");
    expect(attribution?.querySelector("button, a")).toBeNull();

    fireEvent.pointerEnter(attribution!);
    expect(
      screen.getByRole("tooltip", {
        name: "GitHub owner: MentallyQuill · Contributors: Alice · Bots/AI: Claude",
      }),
    ).toBeVisible();

    const descriptionId = link.getAttribute("aria-describedby");
    expect(document.getElementById(descriptionId!)).toHaveTextContent(
      "GitHub repository owner: MentallyQuill. Contributors: Alice. Bots and AI contributors: Claude.",
    );
  });

  test("omits creator attribution for sources without a repository owner", () => {
    const { container } = render(
      <ProjectCard project={project("preset")} now="2026-07-23T00:00:00Z" />,
    );

    expect(container.querySelector(".card-attribution")).toBeNull();
  });

  test("keeps the Kit control outside the GitHub link", () => {
    const { container } = render(
      <ProjectGrid
        projects={[project("memory-tool", { name: "Memory Tool" })]}
        now="2026-07-23T00:00:00Z"
        selection={{
          bindingsFor: () => ({
            state: "available",
            disabled: false,
            disabledReason: null,
            onActivate: vi.fn(),
          }),
        }}
      />,
    );

    const link = screen.getByRole("link", { name: "Memory Tool" });
    const button = screen.getByRole("button", {
      name: "Add Memory Tool to Kit",
    });
    expect(link).not.toContainElement(button);
    expect(container.querySelector(".project-card-shell")).toContainElement(
      link,
    );
    expect(container.querySelector(".project-card-shell")).toContainElement(
      button,
    );
    expect(button.querySelector('[data-kit-glyph="add"]')).toBeInTheDocument();
    expect(button.querySelector('[data-kit-glyph="add"] path')).toHaveAttribute(
      "d",
      "M6 1.5v9M1.5 6h9",
    );
  });

  test("keeps project reporting in Help instead of on catalog cards", () => {
    render(
      <ProjectGrid
        projects={[project("memory-tool", { name: "Memory Tool" })]}
        now="2026-07-23T00:00:00Z"
        selection={{
          bindingsFor: () => ({
            state: "available",
            disabled: false,
            disabledReason: null,
            onActivate: vi.fn(),
          }),
        }}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Report Memory Tool" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Memory Tool to Kit" }),
    ).toBeVisible();
  });

  test("places two-line metadata above a dedicated license utility row", () => {
    const { container } = render(
      <ProjectCard
        project={project("memory-tool", { name: "Memory Tool" })}
        now="2026-07-23T00:00:00Z"
      />,
    );

    const footer = container.querySelector(".card-bottom");
    expect(footer?.children[0]).toHaveClass("card-chips");
    expect(footer?.children[1]).toHaveClass("card-utility");
    expect(footer?.children[1]?.children[0]).toHaveClass("license");
  });

  test("associates a disabled Kit control with its constraint explanation", () => {
    render(
      <ProjectGrid
        projects={[project("memory-tool", { name: "Memory Tool" })]}
        now="2026-07-23T00:00:00Z"
        selection={{
          bindingsFor: () => ({
            state: "available",
            disabled: true,
            disabledReason: "A Kit can contain no more than 50 projects.",
            onActivate: vi.fn(),
          }),
        }}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Add Memory Tool to Kit",
    });
    const descriptionId = button.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)).toHaveTextContent(
      "A Kit can contain no more than 50 projects.",
    );
  });

  test.each([
    ["available", "Add Memory Tool to Kit", "Add to Kit"],
    ["selected", "Remove Memory Tool from selection", "Remove from selection"],
    ["in-kit", "Remove Memory Tool from Kit", "Remove from Kit"],
  ] as const)(
    "explains the %s Kit action without shortening its accessible name",
    (state, accessibleName, tooltipLabel) => {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn(() => ({
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      });
      render(
        <ProjectGrid
          projects={[project("memory-tool", { name: "Memory Tool" })]}
          now="2026-07-23T00:00:00Z"
          selection={{
            bindingsFor: () => ({
              state,
              disabled: false,
              disabledReason: null,
              onActivate: vi.fn(),
            }),
          }}
        />,
      );

      const button = screen.getByRole("button", { name: accessibleName });
      fireEvent.pointerEnter(button);
      expect(screen.getByRole("tooltip", { name: tooltipLabel })).toBeVisible();
    },
  );

  test("exposes pending selection without changing the GitHub link", () => {
    const bindings: ProjectSelectionBindings = {
      state: "selected",
      disabled: false,
      disabledReason: null,
      onActivate: vi.fn(),
    };
    const { container } = render(
      <ProjectGrid
        projects={[project("memory-tool", { name: "Memory Tool" })]}
        now="2026-07-23T00:00:00Z"
        selection={{
          bindingsFor: () => bindings,
        }}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Remove Memory Tool from selection",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Memory Tool" })).toBeVisible();
    expect(container.querySelector(".project-card-shell")).toHaveClass(
      "selected",
    );
    expect(screen.queryByLabelText("Selected")).not.toBeInTheDocument();
  });

  test("marks draft members with an immediate removal control", () => {
    const bindings: ProjectSelectionBindings = {
      state: "in-kit",
      disabled: false,
      disabledReason: null,
      onActivate: vi.fn(),
    };
    const { container } = render(
      <ProjectGrid
        projects={[project("memory-tool", { name: "Memory Tool" })]}
        now="2026-07-23T00:00:00Z"
        selection={{
          bindingsFor: () => bindings,
        }}
      />,
    );

    expect(screen.getByText("In Kit")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove Memory Tool from Kit" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".project-card-shell")).toHaveClass(
      "in-draft",
    );
  });

  test("does not render a catalog drag handle", () => {
    const { container } = render(
      <ProjectGrid
        projects={[project("memory-tool", { name: "Memory Tool" })]}
        now="2026-07-23T00:00:00Z"
        selection={{
          bindingsFor: () => ({
            state: "available",
            disabled: false,
            disabledReason: null,
            onActivate: vi.fn(),
          }),
        }}
      />,
    );

    const link = screen.getByRole("link", { name: "Memory Tool" });
    expect(link).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Drag Memory Tool into Kit" }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".project-card-shell")?.children,
    ).toHaveLength(2);
  });

  test("marks provisional projects with a quiet provisional details treatment", () => {
    render(
      <ProjectCard
        project={project("provisional-card", {
          metadataStatus: "provisional",
        })}
        now="2026-07-23T00:00:00Z"
      />,
    );

    expect(screen.getByText("Provisional details")).toBeInTheDocument();
  });

  test("renders twelve ticks matching the active-week total", () => {
    render(
      <ProjectCard
        project={project("activity-card", {
          activity: {
            latestSourceActivityAt: "2026-07-20T00:00:00Z",
            activeWeeks12: 5,
            weeklyActivity: [
              true,
              false,
              true,
              false,
              false,
              true,
              false,
              false,
              true,
              false,
              false,
              true,
            ],
            evidenceStatus: "complete",
            dormant: false,
          },
        })}
        now="2026-07-24T00:00:00Z"
      />,
    );

    expect(screen.getByText("5/12")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Source activity in 5 of the last 12 weeks"),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".activity-weeks i")).toHaveLength(12);
    expect(document.querySelectorAll(".activity-weeks i.active")).toHaveLength(
      5,
    );
  });

  test("labels provisional and degraded evidence honestly", () => {
    const weeklyActivity = [
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      true,
      true,
    ] as CatalogProject["activity"]["weeklyActivity"];
    const { rerender } = render(
      <ProjectCard
        project={project("provisional-activity", {
          activity: {
            latestSourceActivityAt: "2026-07-20T00:00:00Z",
            activeWeeks12: 3,
            weeklyActivity,
            evidenceStatus: "provisional",
            dormant: false,
          },
        })}
        now="2026-07-24T00:00:00Z"
      />,
    );

    expect(screen.getByText("~3/12")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Approximate activity in 3 of the last 12 weeks; baseline pending",
      ),
    ).toBeInTheDocument();

    rerender(
      <ProjectCard
        project={project("degraded-activity", {
          activity: {
            latestSourceActivityAt: "2026-07-20T00:00:00Z",
            activeWeeks12: 3,
            weeklyActivity,
            evidenceStatus: "degraded",
            dormant: false,
          },
        })}
        now="2026-07-24T00:00:00Z"
      />,
    );

    expect(screen.getByText("3/12")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Source activity in 3 of the last 12 weeks; activity evidence is incomplete",
      ),
    ).toBeInTheDocument();
  });

  test("shows an empty complete window without inventing a source timestamp", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        media: "(max-width: 760px)",
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
      }),
    });

    render(
      <ProjectCard
        project={project("inactive-window", {
          activity: {
            latestSourceActivityAt: null,
            activeWeeks12: 0,
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
              false,
            ],
            evidenceStatus: "complete",
            dormant: true,
          },
        })}
        now="2026-07-24T00:00:00Z"
      />,
    );

    expect(screen.getByText("0/12")).toBeInTheDocument();
    expect(screen.getByText("Quiet")).toBeVisible();
    expect(
      screen.getByLabelText("No source activity in the last 12 weeks"),
    ).toBeInTheDocument();

    fireEvent.pointerEnter(screen.getByText("Quiet"));
    expect(
      screen.getByRole("tooltip", {
        name: "No source activity in the last 12 weeks",
      }),
    ).toBeVisible();
  });

  test("does not claim no activity before a baseline completes", () => {
    const emptyActivity = {
      latestSourceActivityAt: null,
      activeWeeks12: 0,
      weeklyActivity: Array.from({ length: 12 }, () => false) as [
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean,
      ],
      evidenceStatus: "provisional" as const,
      dormant: false,
    };
    const { rerender } = render(
      <ProjectCard
        project={project("provisional-empty", { activity: emptyActivity })}
        now="2026-07-24T00:00:00Z"
      />,
    );

    expect(screen.getByText("Pending")).toBeVisible();
    expect(
      screen.getByLabelText("Source activity baseline pending"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No source activity in the last 12 weeks"),
    ).not.toBeInTheDocument();

    rerender(
      <ProjectCard
        project={project("degraded-empty", {
          activity: { ...emptyActivity, evidenceStatus: "degraded" },
        })}
        now="2026-07-24T00:00:00Z"
      />,
    );
    expect(screen.getByText("Partial")).toBeVisible();
    expect(
      screen.getByLabelText("Source activity evidence incomplete"),
    ).toBeInTheDocument();
  });

  test("renders pending manual-source facts as honest unavailable states", () => {
    render(
      <ProjectCard
        project={project("pending-card", {
          metadataStatus: "provisional",
          sourceStatus: "manual",
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
          license: {
            status: "pending",
            label: "Pending",
            tooltip: "License review is pending for this source.",
          },
        })}
        now="2026-07-23T00:00:00Z"
      />,
    );

    expect(screen.getByText("Manual source")).toBeInTheDocument();
    expect(screen.getByText("No data")).toBeVisible();
    expect(screen.getByLabelText("Activity unavailable")).toBeInTheDocument();
    expect(screen.getByText("Release unavailable")).toBeInTheDocument();
    expect(screen.getByText("Popularity unavailable")).toBeInTheDocument();
    expect(screen.getByText("Repository size unavailable")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("No activity")).not.toBeInTheDocument();
  });

  test("omits inapplicable unavailable facts from curated external presets", () => {
    render(
      <ProjectCard
        project={project("puras-director-v15", {
          name: "Pura's Director v15.0",
          kind: "preset",
          metadataStatus: "curated",
          sourceStatus: "manual",
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
          license: {
            status: "missing",
            label: "Missing",
            tooltip: "No license information is published for this source.",
          },
          preset: {
            version: "15.0",
            publishedAt: null,
            artifactSizeBytes: null,
            modelFamilies: [],
            completionFormats: [],
          },
        })}
        now="2026-07-23T00:00:00Z"
      />,
    );

    const link = screen.getByRole("link", {
      name: "Pura's Director v15.0",
    });
    const card = link.closest("article.project-card");
    const descriptionId = link.getAttribute("aria-describedby");
    const description = document.getElementById(descriptionId!);

    expect(card?.querySelector(".preset-version")).toHaveTextContent("v15.0");
    expect(card?.querySelector(".preset-publication")).toBeNull();
    expect(card?.querySelector(".preset-size")).toBeNull();
    expect(card?.querySelector(".card-state-list")).toBeNull();
    expect(card).toHaveTextContent("Missing");

    for (const label of [
      "Manual source",
      "Activity unavailable",
      "Release unavailable",
      "Popularity unavailable",
      "Repository size unavailable",
    ]) {
      expect(card).not.toHaveTextContent(label);
      expect(description).not.toHaveTextContent(label);
    }
  });

  test("renders only known preset facts", () => {
    render(
      <ProjectCard
        project={project("known-preset", {
          kind: "preset",
          sourceStatus: "manual",
          activity: {
            latestSourceActivityAt: null,
            activeWeeks12: null,
            weeklyActivity: null,
            evidenceStatus: null,
            dormant: false,
          },
          community: null,
          repositorySizeKb: null,
          preset: {
            version: "2.1",
            publishedAt: "2026-07-20T00:00:00Z",
            artifactSizeBytes: 2048,
            modelFamilies: [],
            completionFormats: [],
          },
        })}
        now="2026-07-23T00:00:00Z"
      />,
    );

    expect(document.querySelector(".preset-version")).toHaveTextContent("v2.1");
    expect(document.querySelector(".preset-publication")).toHaveTextContent(
      "Published 3d ago",
    );
    expect(document.querySelector(".preset-size")).toHaveTextContent(
      "2 KB file",
    );
    expect(document.querySelector(".card-state-list")).toBeNull();
  });

  test("keeps actionable preset state without unavailable-field noise", () => {
    const { rerender } = render(
      <ProjectCard
        project={project("pending-preset", {
          kind: "preset",
          metadataStatus: "provisional",
          sourceStatus: "pending",
          activity: {
            latestSourceActivityAt: null,
            activeWeeks12: null,
            weeklyActivity: null,
            evidenceStatus: null,
            dormant: false,
          },
          community: null,
          repositorySizeKb: null,
          preset: {
            version: null,
            publishedAt: null,
            artifactSizeBytes: null,
            modelFamilies: [],
            completionFormats: [],
          },
        })}
        now="2026-07-23T00:00:00Z"
      />,
    );

    const notes = document.querySelectorAll(".card-state-note");
    expect([...notes].map((note) => note.textContent)).toEqual([
      "Provisional details",
      "Source pending",
    ]);
    expect(document.querySelector(".preset-development")).toBeNull();

    rerender(
      <ProjectCard
        project={project("stale-preset", {
          kind: "preset",
          metadataStatus: "curated",
          sourceStatus: "stale",
          staleSince: "2026-07-22T00:00:00Z",
          activity: {
            latestSourceActivityAt: null,
            activeWeeks12: null,
            weeklyActivity: null,
            evidenceStatus: null,
            dormant: false,
          },
          community: null,
          repositorySizeKb: null,
          preset: {
            version: null,
            publishedAt: null,
            artifactSizeBytes: null,
            modelFamilies: [],
            completionFormats: [],
          },
        })}
        now="2026-07-23T00:00:00Z"
      />,
    );

    expect(
      [...document.querySelectorAll(".card-state-note")].map(
        (note) => note.textContent,
      ),
    ).toEqual(["Source stale"]);
  });

  test("keeps known community and repository size facts visible when only activity is missing", () => {
    render(
      <ProjectCard
        project={project("mixed-metrics-card", {
          metadataStatus: "provisional",
          sourceStatus: "manual",
          activity: {
            latestSourceActivityAt: null,
            activeWeeks12: null,
            weeklyActivity: null,
            evidenceStatus: null,
            dormant: false,
          },
          community: { stars: 10, forks: 2, watchers: 1, aggregate: 13 },
          repositorySizeKb: 100,
        })}
        now="2026-07-23T00:00:00Z"
      />,
    );

    expect(screen.getByText("Manual source")).toBeInTheDocument();
    expect(screen.getByText("No data")).toBeVisible();
    expect(screen.getByLabelText("Activity unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText("Popularity unavailable"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Repository size unavailable"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("100 KB repo")).toBeInTheDocument();
  });

  test("renders source pending state directly without fabricating other missing facts", () => {
    render(
      <ProjectCard
        project={project("pending-source-card", {
          sourceStatus: "pending",
          activity: {
            latestSourceActivityAt: "2026-07-20T00:00:00Z",
            activeWeeks12: 4,
            weeklyActivity: [
              false,
              false,
              false,
              false,
              false,
              false,
              false,
              false,
              true,
              true,
              true,
              true,
            ],
            evidenceStatus: "provisional",
            dormant: false,
          },
        })}
        now="2026-07-23T00:00:00Z"
      />,
    );

    expect(screen.getByText("Source pending")).toBeInTheDocument();
    expect(screen.getByText("~4/12")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("100 KB repo")).toBeInTheDocument();
    expect(
      screen.queryByText("Popularity unavailable"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Repository size unavailable"),
    ).not.toBeInTheDocument();
  });

  test("surfaces stale source status without hiding last known good facts", () => {
    render(
      <ProjectCard
        project={project("stale-card", {
          sourceStatus: "stale",
          staleSince: "2026-07-22T00:00:00Z",
        })}
        now="2026-07-24T00:00:00Z"
      />,
    );

    expect(screen.getByText("Source stale")).toBeInTheDocument();
    expect(screen.getByText("4/12")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("100 KB repo")).toBeInTheDocument();
  });
});
