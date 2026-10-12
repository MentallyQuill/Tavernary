import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { KitFilterPanel } from "@/features/kits/components/kit-filter-panel";
import { DEFAULT_KIT_QUERY } from "@/features/kits/kit-query";
import type { KitQuery } from "@/features/kits/kit-query";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { CatalogKit } from "@/features/kits/kit-types";
import { catalogSearchFields } from "../helpers/catalog-search-fields";

afterEach(cleanup);

const label = (id: string) => ({ id, label: id, description: id });
const project: CatalogProject = {
  id: "routing-extension",
  name: "Routing Extension",
  kind: "extension",
  metadataStatus: "curated",
  sourceStatus: "healthy",
  primaryFunction: "generation-reasoning",
  summary: "Routing",
  canonicalUrl: "https://example.com/routing",
  install: null,
  catalogedAt: "2026-07-01T00:00:00.000Z",
  catalogCohort: "standard",
  frontends: [label("sillytavern")],
  tags: [{ ...label("route-tasks-across-models"), facet: "goal" }],
  search: catalogSearchFields("Routing Extension"),
  tavernKeeper: null,
  fork: null,
  attribution: null,
  activity: {
    latestSourceActivityAt: "2026-07-20T00:00:00.000Z",
    activeWeeks12: 1,
    weeklyActivity: null,
    evidenceStatus: "complete",
    dormant: false,
  },
  latestReleaseAt: "2026-07-20T00:00:00.000Z",
  community: null,
  repositorySizeKb: null,
  license: { status: "osi-approved", label: "MIT", tooltip: "MIT" },
  preset: null,
  refreshedAt: "2026-07-24T00:00:00.000Z",
  staleSince: null,
};
const kit: CatalogKit = {
  id: "routing-kit",
  title: "Routing Kit",
  description: "Routing",
  author: { githubUserId: 42, login: "routing-author" },
  sourceIssueNumber: 42,
  sourceIssueUrl: "https://github.com/fixture/catalog/issues/42",
  publishedAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  frontends: [label("sillytavern")],
  purposes: [label("generation-reasoning")],
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
      project: null,
    },
    {
      projectId: project.id,
      name: project.name,
      kind: project.kind,
      primaryFunction: project.primaryFunction,
      availability: "available",
      unavailableReason: null,
      canonicalUrl: project.canonicalUrl,
      project,
    },
    {
      projectId: "second-extension",
      name: "Second Extension",
      kind: "extension",
      primaryFunction: "memory-retrieval",
      availability: "available",
      unavailableReason: null,
      canonicalUrl: "https://example.com/second",
      project: null,
    },
  ],
  supporterCount: 1,
  trendingScore: 1,
  supportRefreshedAt: "2026-07-24T00:00:00.000Z",
  supportStale: false,
  flaggedProjectCount: 0,
  search: catalogSearchFields("Routing Kit"),
};

describe("KitFilterPanel", () => {
  test.each([
    { query: {}, search: "Routing", counts: [1, 1, 1, 1, 1, 1] },
    {
      query: { frontends: ["other"] },
      search: "Routing",
      counts: [1, 0, 0, 1, 0, 0],
    },
    {
      query: { purposes: ["memory-retrieval"] },
      search: "Routing",
      counts: [0, 1, 0, 1, 0, 0],
    },
    {
      query: { modelFamilies: ["gpt"] },
      search: "Routing",
      counts: [0, 0, 1, 1, 0, 0],
    },
    {
      query: { includesProjectId: "other-project" },
      search: "Routing",
      counts: [0, 0, 0, 1, 1, 0],
    },
    {
      query: { minProjects: 4, maxProjects: 4 },
      search: "Routing",
      counts: [0, 0, 0, 1, 0, 0],
    },
    {
      query: { allComponentsAvailable: true },
      search: "Routing",
      counts: [1, 1, 1, 0, 1, 1],
    },
    { query: {}, search: "Routing + Other", counts: [2, 2, 1, 2, 2, 2] },
    { query: {}, search: "Routin", counts: [0, 0, 0, 0, 0, 0] },
  ])(
    "retains contextual facet counts for $query and $search",
    ({ query, search, counts }) => {
      const otherProject = {
        ...project,
        id: "other-project",
        name: "Other project",
      };
      const kits: CatalogKit[] = [
        { ...kit, modelFamilies: [label("claude")] },
        {
          ...kit,
          id: "flagged-kit",
          frontends: [label("other")],
          purposes: [label("memory-retrieval")],
          modelFamilies: [label("gpt")],
          flaggedProjectCount: 1,
          components: [
            ...kit.components.filter(
              ({ projectId }) => projectId !== project.id,
            ),
            {
              ...kit.components[1],
              projectId: otherProject.id,
            },
            kit.components[0],
          ],
        },
        {
          ...kit,
          id: "other-search",
          search: catalogSearchFields("Other"),
          modelFamilies: [label("gpt")],
        },
      ];
      render(
        <KitFilterPanel
          projects={[project, otherProject]}
          kits={kits}
          query={{ ...DEFAULT_KIT_QUERY, ...query } as KitQuery}
          search={search}
          onChange={() => undefined}
          onClear={() => undefined}
        />,
      );
      const names = [
        "sillytavern",
        "generation-reasoning",
        "Claude",
        "GPT",
        project.name,
        "All components available",
      ];
      names.forEach((name, index) => {
        const role = index === 4 ? "radio" : "checkbox";
        expect(
          screen.getByRole(role, { name }).closest("label"),
        ).toHaveTextContent(`${name}${counts[index]}`);
      });
    },
  );

  test("shares text matches across facet counts and local filter searches", () => {
    const observedKit = { ...kit };
    let searchReads = 0;
    Object.defineProperty(observedKit, "search", {
      get: () => {
        searchReads += 1;
        return kit.search;
      },
    });
    const props = {
      projects: [project],
      kits: [observedKit],
      search: "Routing",
      onChange: () => undefined,
      onClear: () => undefined,
    };
    const query = { ...DEFAULT_KIT_QUERY, frontends: ["unknown"] };
    const { rerender } = render(<KitFilterPanel {...props} query={query} />);

    expect(searchReads).toBe(1);
    expect(
      screen.getByRole("checkbox", { name: "sillytavern" }).closest("label"),
    ).toHaveTextContent("sillytavern1");
    expect(
      screen.getByRole("radio", { name: project.name }).closest("label"),
    ).toHaveTextContent(`${project.name}0`);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search compatible frontends" }),
      {
        target: { value: "silly" },
      },
    );
    expect(searchReads).toBe(1);
    rerender(
      <KitFilterPanel
        {...props}
        query={{ ...query, includesProjectId: "missing" }}
      />,
    );
    expect(searchReads).toBe(1);
    expect(
      screen.getByRole("checkbox", { name: "sillytavern" }).closest("label"),
    ).toHaveTextContent("sillytavern0");

    rerender(
      <KitFilterPanel {...props} query={DEFAULT_KIT_QUERY} search="Missing" />,
    );
    expect(searchReads).toBe(1);
    expect(
      screen.getByRole("radio", { name: project.name }).closest("label"),
    ).toHaveTextContent(`${project.name}0`);
    rerender(
      <KitFilterPanel
        {...props}
        query={DEFAULT_KIT_QUERY}
        kits={[
          { ...kit, id: "replacement", search: catalogSearchFields("Other") },
        ]}
      />,
    );
    expect(
      screen.getByRole("radio", { name: project.name }).closest("label"),
    ).toHaveTextContent(`${project.name}0`);
  });

  test("uses the shared desktop Filters title row", () => {
    render(
      <KitFilterPanel
        query={DEFAULT_KIT_QUERY}
        kits={[kit]}
        projects={[project]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(screen.getByText("Filters")).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeVisible();
  });

  test("includes the shared compact legal footer", () => {
    render(
      <KitFilterPanel
        query={DEFAULT_KIT_QUERY}
        kits={[]}
        projects={[]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(screen.getByText("Tavernary")).toBeVisible();
    expect(screen.getByRole("link", { name: "AGPL-3.0-only" })).toBeVisible();
  });

  test("renders catalog-backed filters before any Kits are published", () => {
    render(
      <KitFilterPanel
        query={DEFAULT_KIT_QUERY}
        kits={[]}
        projects={[project]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Compatible frontend" }),
    ).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "sillytavern" }).closest("label"),
    ).toHaveTextContent("sillytavern0");
    expect(screen.getByRole("group", { name: "Purpose" })).toBeVisible();
    expect(
      screen
        .getByRole("checkbox", { name: "Generation & Reasoning" })
        .closest("label"),
    ).toHaveTextContent("Generation & Reasoning0");
    expect(
      screen.getByRole("group", { name: "Includes project" }),
    ).toBeVisible();
    expect(
      screen.getByRole("radio", { name: "Routing Extension" }).closest("label"),
    ).toHaveTextContent("Routing Extension0");
  });

  test("renders the approved Kit filters in order", () => {
    render(
      <KitFilterPanel
        query={DEFAULT_KIT_QUERY}
        kits={[kit]}
        projects={[project]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(
      screen.getAllByRole("group").map((group) => group.textContent?.trim()),
    ).toEqual([
      expect.stringMatching(/^Compatible frontend/),
      expect.stringMatching(/^Purpose/),
      expect.stringMatching(/^Model family/),
      expect.stringMatching(/^Includes project/),
      expect.stringMatching(/^Kit size/),
      expect.stringMatching(/^Kit status/),
    ]);
    expect(
      screen.getByRole("checkbox", { name: "All components available" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("checkbox", { name: "Tavernary Pick" }),
    ).not.toBeInTheDocument();
  });

  test("counts fully available Kits", () => {
    const flaggedPick = {
      ...kit,
      id: "flagged-pick",
      flaggedProjectCount: 1,
    };
    const availableNonPick = {
      ...kit,
      id: "available-non-pick",
      flaggedProjectCount: 0,
    };
    render(
      <KitFilterPanel
        query={{ ...DEFAULT_KIT_QUERY, allComponentsAvailable: true }}
        kits={[flaggedPick, availableNonPick]}
        projects={[project]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(
      screen
        .getByRole("checkbox", { name: "All components available" })
        .closest("label"),
    ).toHaveTextContent("All components available1");
  });

  test("makes the Purpose facet searchable", () => {
    render(
      <KitFilterPanel
        query={DEFAULT_KIT_QUERY}
        kits={[kit]}
        projects={[project]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(
      screen.getByRole("searchbox", { name: "Search Kit purposes" }),
    ).toBeVisible();
  });

  test("applies catalog search text to Kit facet counts", () => {
    render(
      <KitFilterPanel
        query={DEFAULT_KIT_QUERY}
        kits={[kit]}
        projects={[project]}
        search="does-not-match"
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: "sillytavern" }).closest("label"),
    ).toHaveTextContent("sillytavern0");
  });

  test("displays an included project's name while preserving its ID state", () => {
    render(
      <KitFilterPanel
        query={{ ...DEFAULT_KIT_QUERY, includesProjectId: project.id }}
        kits={[kit]}
        projects={[project]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(screen.getByRole("radio", { name: project.name })).toBeChecked();
  });

  test("shows contextual counts in the searchable included-project selector", () => {
    const secondProject = {
      ...project,
      id: "second-extension",
      name: "Second Extension",
    };
    const secondKit = {
      ...kit,
      id: "second-kit",
      components: kit.components.map((component) =>
        component.projectId === project.id
          ? {
              ...component,
              projectId: secondProject.id,
              name: secondProject.name,
              project: secondProject,
            }
          : component,
      ),
    };
    render(
      <KitFilterPanel
        query={{
          ...DEFAULT_KIT_QUERY,
          includesProjectId: secondProject.id,
        }}
        kits={[kit, secondKit]}
        projects={[project, secondProject]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(
      screen.getByRole("searchbox", { name: "Search included projects" }),
    ).toBeVisible();
    expect(
      screen.getByRole("radio", { name: project.name }).closest("label"),
    ).toHaveTextContent(`${project.name}1`);
  });

  test("uses one shared Clear all action without a duplicate footer button", () => {
    render(
      <KitFilterPanel
        query={DEFAULT_KIT_QUERY}
        kits={[]}
        projects={[]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Clear all" })).toHaveLength(
      1,
    );
    expect(
      screen.queryByRole("button", { name: "Clear Kit filters" }),
    ).not.toBeInTheDocument();
  });

  test("renders Kit size as one dual-thumb range without number fields", () => {
    const { container } = render(
      <KitFilterPanel
        query={{ ...DEFAULT_KIT_QUERY, minProjects: 8, maxProjects: 24 }}
        kits={[kit]}
        projects={[project]}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(screen.getByRole("group", { name: "Kit size" })).toHaveClass(
      "dual-range",
    );
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(0);
    expect(screen.getByText("Min 8")).toBeVisible();
    expect(screen.getByText("Max 24")).toBeVisible();
  });

  test("renders mobile Kit filters as a visible modal sheet", () => {
    render(
      <KitFilterPanel
        query={DEFAULT_KIT_QUERY}
        kits={[kit]}
        projects={[project]}
        onChange={() => undefined}
        onClear={() => undefined}
        mobile
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveClass("filter-sheet");
    expect(dialog).not.toHaveClass("filter-panel");
    expect(
      screen.getByRole("button", { name: "Close Kit filters" }),
    ).toBeVisible();
    expect(
      screen.getByRole("group", { name: "Compatible frontend" }),
    ).toBeVisible();
  });
});
