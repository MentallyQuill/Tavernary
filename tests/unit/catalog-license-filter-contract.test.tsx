import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { DEFAULT_QUERY } from "@/features/catalog/catalog-query";
import { selectProjects } from "@/features/catalog/catalog-selectors";
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

describe("catalog license filter contract", () => {
  test("missing license filter includes pending licenses in both selection and facet count", () => {
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
        { ...DEFAULT_QUERY, licenses: ["missing"] },
        { now: "2026-07-23T00:00:00Z" },
      ).map(({ id }) => id),
    ).toEqual(["missing-license", "pending-license"]);

    render(
      <FilterPanel
        query={DEFAULT_QUERY}
        projects={projects}
        onToggle={() => {}}
        onClear={() => {}}
      />,
    );

    expect(
      screen
        .getByRole("checkbox", { name: "Missing license" })
        .closest("label"),
    ).toHaveTextContent("Missing license2");
  });
});
