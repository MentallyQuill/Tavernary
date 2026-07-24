import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ProjectCard } from "@/features/catalog/components/project-card";
import type { CatalogProject } from "@/features/catalog/catalog-types";

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
    frontends: [{ id: "sillytavern", label: "SillyTavern" }],
    capabilities: [{ id: "automation", label: "Automation" }],
    searchableText: `${id} extension automation`,
    activity: {
      latestMeaningfulCommitAt: "2026-07-20T00:00:00Z",
      activeWeeks12: 4,
      twoWeekBars: [1, 1, 1, 1, 0, 0],
      strength: 1000,
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

  test("renders pending manual-source facts as honest unavailable states", () => {
    render(
      <ProjectCard
        project={project("pending-card", {
          metadataStatus: "provisional",
          sourceStatus: "manual",
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
    expect(screen.getByText("Activity unavailable")).toBeInTheDocument();
    expect(screen.getByText("Release unavailable")).toBeInTheDocument();
    expect(screen.getByText("Popularity unavailable")).toBeInTheDocument();
    expect(screen.getByText("Repository size unavailable")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("No activity")).not.toBeInTheDocument();
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
