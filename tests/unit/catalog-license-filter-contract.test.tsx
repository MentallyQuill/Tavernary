import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { DEFAULT_QUERY } from "@/features/catalog/catalog-query";
import { selectProjects } from "@/features/catalog/catalog-selectors";
import { ActiveQuery } from "@/features/catalog/components/active-query";
import { FilterPanel } from "@/features/catalog/components/filter-panel";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import { catalogSearchFields } from "../helpers/catalog-search-fields";

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
        tagVocabulary={[]}
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

  test("relationship scope replaces suspended filters with one removable token", () => {
    const onRemoveRelationship = vi.fn();
    render(
      <ActiveQuery
        query={{
          ...DEFAULT_QUERY,
          relationship: "vectfox",
          search: "memory",
          frontends: ["sillytavern"],
        }}
        projects={[project("vecthare"), project("vectfox")]}
        relationship={{
          childId: "vectfox",
          childName: "VectFox",
          parentName: "VectHare",
        }}
        onRemoveRelationship={onRemoveRelationship}
        onRemove={() => {}}
        onClear={() => {}}
      />,
    );

    const token = screen.getByRole("button", {
      name: "Remove fork relationship between VectHare and VectFox",
    });
    expect(token).toHaveTextContent("Fork: VectHare → VectFox");
    expect(
      screen.queryByRole("button", { name: "Remove Search: memory" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove SillyTavern" }),
    ).not.toBeInTheDocument();

    fireEvent.click(token);
    expect(onRemoveRelationship).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeVisible();
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
        tagVocabulary={[]}
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

  test("links the filter footer to Tavernary legal information", () => {
    render(
      <FilterPanel
        query={DEFAULT_QUERY}
        projects={[project("legal-link")]}
        tagVocabulary={[]}
        now="2026-07-23T00:00:00Z"
        onToggle={() => {}}
        onClear={() => {}}
      />,
    );

    const legalLink = screen.getByRole("link", {
      name: "Legal information",
    });
    expect(legalLink).toHaveAttribute("href", "/about#legal-information");
    expect(legalLink.parentElement).toHaveTextContent(
      "Tavernary·AGPL-3.0-only·Legal information",
    );
  });
});
