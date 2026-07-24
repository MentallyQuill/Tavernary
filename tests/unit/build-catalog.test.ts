import { expect, test } from "vitest";

import { buildCatalog } from "../../scripts/catalog/build.mjs";

const fixtureProject = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  id: "fixture",
  name: "Fixture",
  kind: "preset",
  summary: "Fixture summary.",
  source: {
    type: "url",
    url: "https://example.com/fixture",
    published_at: null,
    version: null,
    artifact_size_bytes: null,
    license_status: "missing",
    license_spdx_id: null,
  },
  frontends: ["sillytavern"],
  primary_function: "generation-reasoning",
  capabilities: [],
  cataloged_at: "2026-07-23T00:00:00Z",
  catalog_cohort: "seed",
  visibility: "published",
  refresh_policy: "paused",
  ...overrides,
});

const fixtureSnapshot = (overrides: Record<string, unknown> = {}) => ({
  project_id: "fixture",
  source_health: "healthy",
  ...overrides,
});

test("builds five public cards without leaking intake metadata", async () => {
  const catalog = await buildCatalog({ write: false });
  expect(catalog.projects).toHaveLength(5);
  expect(catalog.projects.map((project) => project.id)).toContain(
    "purrfect-logic-4-max-mini",
  );
  expect(catalog.projects.map(({ id }) => id)).toEqual(
    [...catalog.projects.map(({ id }) => id)].sort(),
  );
  const recursion = catalog.projects.find(
    ({ id }) => id === "mentallyquill-recursion",
  );
  expect(recursion?.activity.twoWeekBars).toHaveLength(6);
  expect(recursion?.community?.aggregate).toBe(
    (recursion?.community?.stars ?? 0) +
      (recursion?.community?.forks ?? 0) +
      (recursion?.community?.subscribers ?? 0),
  );
  expect(JSON.stringify(catalog)).not.toContain("submitted_at");
  expect(JSON.stringify(catalog)).not.toContain("submission");
});

test("excludes curator and source quarantine states", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [
      fixtureProject({ id: "disabled", visibility: "disabled" }),
      fixtureProject({ id: "unsafe" }),
    ],
    snapshots: [
      fixtureSnapshot({
        project_id: "unsafe",
        source_health: "identity-change",
      }),
    ],
  });
  expect(catalog.projects).toEqual([]);
});

test("uses source timestamps for deterministic generated output", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [fixtureProject()],
    snapshots: [],
  });

  expect(catalog.generatedAt).toBe("2026-07-23T00:00:00.000Z");
});
