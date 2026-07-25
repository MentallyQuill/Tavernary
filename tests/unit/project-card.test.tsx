import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ProjectCard } from "@/features/catalog/components/project-card";
import { ProjectGrid } from "@/features/catalog/components/project-grid";
import type { CatalogProject } from "@/features/catalog/catalog-types";

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
    capabilities: [
      {
        id: "automation",
        label: "Automation",
        description: "Automates roleplay tasks.",
      },
    ],
    searchableText: `${id} extension automation`,
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
    community: { stars: 10, forks: 2, subscribers: 1, aggregate: 13 },
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

  test("shows a stable Added state for projects already in the draft", () => {
    render(
      <ProjectGrid
        projects={[project("memory-tool", { name: "Memory Tool" })]}
        now="2026-07-23T00:00:00Z"
        draftProjectIds={["memory-tool"]}
        onAddToKit={() => undefined}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Memory Tool added to Kit" }),
    ).toBeDisabled();
    expect(screen.getByText("Added")).toBeVisible();
  });

  test("renders a desktop drag handle beside the project link", () => {
    const { container } = render(
      <ProjectGrid
        projects={[project("memory-tool", { name: "Memory Tool" })]}
        now="2026-07-23T00:00:00Z"
        draftProjectIds={[]}
        onAddToKit={() => undefined}
        onProjectDragStart={() => undefined}
      />,
    );

    const link = screen.getByRole("link", { name: "Memory Tool" });
    const handle = screen.getByRole("button", {
      name: "Drag Memory Tool into Kit",
    });
    expect(link.contains(handle)).toBe(false);
    expect(
      container.querySelector(".project-card-shell")?.children,
    ).toHaveLength(3);
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
          community: { stars: 10, forks: 2, subscribers: 1, aggregate: 13 },
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
