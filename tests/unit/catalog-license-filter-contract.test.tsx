import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { DEFAULT_QUERY } from "@/features/catalog/catalog-query";
import { selectProjects } from "@/features/catalog/catalog-selectors";
import { ActiveQuery } from "@/features/catalog/components/active-query";
import { FilterPanel } from "@/features/catalog/components/filter-panel";
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

describe("catalog license filter contract", () => {
  test.afterEach(() => {
    cleanup();
  });

  test("pending and missing license filters stay distinct in selection and facet counts", () => {
    const projects = [
      project("pending-license", {
        license: {
          status: "pending",
          label: "Pending review",
          tooltip: "License review is pending for this source.",
        },
      }),
      project("missing-license", {
        license: {
          status: "missing",
          label: "Missing",
          tooltip: "Missing",
        },
      }),
      project("open-source"),
    ];

    expect(
      selectProjects(
        projects,
        { ...DEFAULT_QUERY, licenses: ["pending"] },
        { now: "2026-07-23T00:00:00Z" },
      ).map(({ id }) => id),
    ).toEqual(["pending-license"]);

    expect(
      selectProjects(
        projects,
        { ...DEFAULT_QUERY, licenses: ["missing"] },
        { now: "2026-07-23T00:00:00Z" },
      ).map(({ id }) => id),
    ).toEqual(["missing-license"]);

    render(
      <FilterPanel
        query={DEFAULT_QUERY}
        projects={projects}
        now="2026-07-23T00:00:00Z"
        onToggle={() => {}}
        onClear={() => {}}
      />,
    );

    expect(
      screen
        .getByRole("checkbox", { name: "Pending verification" })
        .closest("label"),
    ).toHaveTextContent("Pending verification1");

    expect(
      screen
        .getByRole("checkbox", { name: "Missing license" })
        .closest("label"),
    ).toHaveTextContent("Missing license1");
  });

  test("active query uses the pending verification label", () => {
    render(
      <ActiveQuery
        query={{ ...DEFAULT_QUERY, licenses: ["pending"] }}
        projects={[project("pending-license")]}
        onRemove={() => {}}
        onClear={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Remove Pending verification" }),
    ).toBeInTheDocument();
  });

  test("development facet counts match selector semantics", () => {
    const projects = [
      project("recent-commit", {
        activity: {
          ...project("base").activity,
          latestSourceActivityAt: "2026-07-20T00:00:00Z",
        },
      }),
      project("old-commit", {
        activity: {
          ...project("base").activity,
          latestSourceActivityAt: "2026-05-01T00:00:00Z",
        },
      }),
      project("recent-release", {
        activity: {
          ...project("base").activity,
          latestSourceActivityAt: null,
          activeWeeks12: null,
          weeklyActivity: null,
          evidenceStatus: null,
        },
        latestReleaseAt: "2026-07-10T00:00:00Z",
      }),
      project("old-release", {
        activity: {
          ...project("base").activity,
          latestSourceActivityAt: null,
          activeWeeks12: null,
          weeklyActivity: null,
          evidenceStatus: null,
        },
        latestReleaseAt: "2026-03-01T00:00:00Z",
      }),
    ];

    expect(
      selectProjects(
        projects,
        { ...DEFAULT_QUERY, development: ["active-month"] },
        { now: "2026-07-23T00:00:00Z" },
      ).map(({ id }) => id),
    ).toEqual(["recent-commit"]);

    expect(
      selectProjects(
        projects,
        { ...DEFAULT_QUERY, development: ["new-release"] },
        { now: "2026-07-23T00:00:00Z" },
      ).map(({ id }) => id),
    ).toEqual(["recent-release"]);

    render(
      <FilterPanel
        query={DEFAULT_QUERY}
        projects={projects}
        now="2026-07-23T00:00:00Z"
        onToggle={() => {}}
        onClear={() => {}}
      />,
    );

    expect(
      screen
        .getByRole("checkbox", { name: "Active this month" })
        .closest("label"),
    ).toHaveTextContent("Active this month1");

    expect(
      screen
        .getByRole("checkbox", { name: "Recently released" })
        .closest("label"),
    ).toHaveTextContent("Recently released1");
  });
});
