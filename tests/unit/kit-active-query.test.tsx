import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { ActiveQuery } from "@/features/catalog/components/active-query";
import { DEFAULT_QUERY } from "@/features/catalog/catalog-query";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { CatalogKit } from "@/features/kits/kit-types";

const label = (id: string, text = id) => ({
  id,
  label: text,
  description: text,
});
const project: CatalogProject = {
  id: "routing",
  name: "Routing",
  kind: "extension",
  metadataStatus: "curated",
  sourceStatus: "healthy",
  primaryFunction: "generation-reasoning",
  summary: "Routing",
  canonicalUrl: "https://example.com/routing",
  catalogedAt: "2026-07-01T00:00:00.000Z",
  catalogCohort: "standard",
  frontends: [label("sillytavern")],
  capabilities: [label("model-routing", "Model routing")],
  searchableText: "routing",
  attribution: null,
  activity: {
    latestSourceActivityAt: "2026-07-20T00:00:00.000Z",
    activeWeeks12: 1,
    weeklyActivity: null,
    evidenceStatus: "complete",
    dormant: false,
  },
  latestReleaseAt: null,
  community: null,
  repositorySizeKb: null,
  license: { status: "osi-approved", label: "MIT", tooltip: "MIT" },
  preset: null,
  refreshedAt: "2026-07-24T00:00:00.000Z",
  staleSince: null,
};
const kit: CatalogKit = {
  id: "kit",
  title: "Kit",
  description: "Kit",
  author: { githubUserId: 42, login: "routing-author" },
  sourceIssueNumber: 42,
  publishedAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  frontends: [label("sillytavern")],
  purposes: [],
  components: [
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
  ],
  supporterCount: null,
  trendingScore: null,
  supportRefreshedAt: null,
  supportStale: false,
  flaggedProjectCount: 0,
  searchableText: "kit routing",
};

test("renders removable tokens for retained Kit filters", () => {
  render(
    <ActiveQuery
      query={{
        ...DEFAULT_QUERY,
        mode: "kits",
        kits: {
          ...DEFAULT_QUERY.kits,
          frontends: ["sillytavern"],
          purposes: ["generation-reasoning"],
          includesProjectId: project.id,
          minProjects: 4,
          maxProjects: 12,
          allComponentsAvailable: true,
        },
      }}
      projects={[project]}
      kits={[kit]}
      onRemove={() => undefined}
      onRemoveKit={() => undefined}
      onClear={() => undefined}
    />,
  );

  for (const label of [
    "sillytavern",
    "generation-reasoning",
    "Includes: Routing",
    "4–12 projects",
    "All components available",
  ]) {
    expect(
      screen.getByRole("button", { name: `Remove ${label}` }),
    ).toBeVisible();
  }
});
