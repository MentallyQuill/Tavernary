import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import type { CatalogProject } from "@/features/catalog/catalog-types";
import { KitProjectStack } from "@/features/kits/components/kit-project-stack";
import type { CatalogKitComponent } from "@/features/kits/kit-types";
import { catalogSearchFields } from "../helpers/catalog-search-fields";

afterEach(cleanup);

function project({
  id,
  name,
  ...overrides
}: Pick<CatalogProject, "id" | "name"> &
  Partial<Omit<CatalogProject, "id" | "name">>): CatalogProject {
  return {
    id,
    name,
    kind: "extension",
    metadataStatus: "curated",
    sourceStatus: "healthy",
    primaryFunction: "memory-retrieval",
    summary: `${name} summary`,
    canonicalUrl: `https://example.com/projects/${id}`,
    catalogedAt: "2026-07-01T00:00:00.000Z",
    catalogCohort: "standard",
    frontends: [],
    tags: [],
    search: catalogSearchFields(name),
    fork: null,
    attribution: {
      owner: { provider: "github", login: "example-owner" },
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
    preset: null,
    refreshedAt: "2026-07-24T00:00:00.000Z",
    staleSince: null,
    ...overrides,
  };
}

function component(
  value: CatalogProject,
  canonicalUrl = value.canonicalUrl,
): CatalogKitComponent {
  return {
    projectId: value.id,
    name: value.name,
    kind: value.kind,
    primaryFunction: value.primaryFunction,
    availability: "available",
    unavailableReason: null,
    canonicalUrl,
    project: value,
  };
}

test("renders available projects as ordinary compact project cards in order", () => {
  render(
    <KitProjectStack
      now="2026-07-24T00:00:00.000Z"
      components={[
        component(
          project({ id: "frontend", name: "Frontend" }),
          "https://example.com/kits/frontend",
        ),
        component(project({ id: "memory", name: "Memory" })),
      ]}
    />,
  );

  const links = screen.getAllByRole("link");
  expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
    "Frontend",
    "Memory",
  ]);
  expect(links[0]).toHaveClass("project-card", "kind-extension");
  expect(links[0]).toHaveAttribute("href", "https://example.com/kits/frontend");
  expect(links[0]).toHaveAttribute("target", "_blank");
  expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(document.querySelector("[aria-expanded]")).toBeNull();
  expect(document.querySelector(".project-kit-control")).toBeNull();
});

test("keeps unavailable projects visible and noninteractive", () => {
  render(
    <KitProjectStack
      now="2026-07-24T00:00:00.000Z"
      components={[
        {
          projectId: "flagged",
          name: "Flagged Tool",
          kind: "extension",
          primaryFunction: "memory-retrieval",
          availability: "flagged",
          unavailableReason: "unsafe-source",
          canonicalUrl: null,
          project: null,
        },
      ]}
    />,
  );

  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByText("Flagged Tool")).toBeVisible();
  expect(screen.getByText("unsafe-source")).toBeVisible();
  expect(
    screen.getByRole("group", { name: "Flagged Tool unavailable" }),
  ).toHaveAttribute("aria-disabled", "true");
});
