import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { DEFAULT_QUERY } from "@/features/catalog/catalog-query";
import { FilterPanel } from "@/features/catalog/components/filter-panel";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import { KitFilterPanel } from "@/features/kits/components/kit-filter-panel";
import { DEFAULT_KIT_QUERY } from "@/features/kits/kit-query";

afterEach(cleanup);

function frontendCard(
  frontendId: string,
  name: string,
  aggregate: number,
): CatalogProject {
  return {
    id: `${frontendId}-card`,
    name,
    kind: "frontend",
    metadataStatus: "curated",
    sourceStatus: "healthy",
    primaryFunction: "frontend",
    summary: `${name} summary`,
    canonicalUrl: `https://example.com/${frontendId}`,
    catalogedAt: "2026-07-01T00:00:00Z",
    catalogCohort: "standard",
    frontends: [
      {
        id: frontendId,
        label: name,
        description: `Works with ${name}.`,
      },
    ],
    tags: [],
    searchableText: name,
    fork: null,
    attribution: null,
    activity: {
      latestSourceActivityAt: "2026-07-20T00:00:00Z",
      activeWeeks12: 4,
      weeklyActivity: null,
      evidenceStatus: "complete",
      dormant: false,
    },
    latestReleaseAt: null,
    community: { stars: aggregate, forks: 0, watchers: 0, aggregate },
    repositorySizeKb: 100,
    license: {
      status: "osi-approved",
      label: "MIT",
      tooltip: "Open source",
    },
    preset: null,
    refreshedAt: "2026-07-26T00:00:00Z",
    staleSince: null,
  };
}

const projects = [
  frontendCard("aikobots", "Aikobots", 8),
  frontendCard("lumiverse", "Lumiverse", 21),
  frontendCard("marinara-engine", "Marinara Engine", 13),
];
const expectedOrder = ["Lumiverse", "Marinara Engine", "Aikobots"];

function visibleFrontendOrder() {
  const group = screen.getByRole("group", { name: "Compatible frontend" });
  return within(group)
    .getAllByRole("checkbox")
    .slice(0, 3)
    .map((checkbox) => checkbox.getAttribute("aria-label"));
}

describe("Compatible frontend filter order", () => {
  test("uses frontend card popularity in Projects mode", () => {
    render(
      <FilterPanel
        query={DEFAULT_QUERY}
        projects={projects}
        tagVocabulary={[]}
        onToggle={() => undefined}
        onClear={() => undefined}
        now="2026-07-26T00:00:00Z"
      />,
    );

    expect(visibleFrontendOrder()).toEqual(expectedOrder);
  });

  test("uses the same frontend card popularity in Kits mode", () => {
    render(
      <KitFilterPanel
        query={DEFAULT_KIT_QUERY}
        kits={[]}
        projects={projects}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );

    expect(visibleFrontendOrder()).toEqual(expectedOrder);
  });
});
