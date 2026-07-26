import { expect, test } from "vitest";

import {
  selectRandomCanaryIds,
  selectRepresentativeCanaryIds,
} from "../../scripts/catalog/select-enrichment-canary.mjs";

function record(
  id: string,
  overrides: Record<string, unknown> = {},
): { id: string } & Record<string, unknown> {
  return {
    id,
    visibility: "published",
    metadata_status: "provisional",
    enrichment_policy: "automatic",
    summary: "An extension for SillyTavern.",
    refresh_policy: "automatic",
    source: {
      type: "github",
      repository: `owner/${id}`,
      repository_id: null,
    },
    ...overrides,
  };
}

test("selects five unique random IDs from refreshable enrichment records", () => {
  const records = [
    ...Array.from({ length: 7 }, (_, index) => record(`eligible-${index}`)),
    record("manual", { refresh_policy: "manual" }),
    record("hidden", { visibility: "hidden" }),
    record("curated", {
      metadata_status: "curated",
      summary: "A complete editorial description.",
    }),
    record("external", { source: { type: "url" } }),
  ];
  const draws = [6, 0, 4, 1, 2];

  const selected = selectRandomCanaryIds(records, {
    randomInt: (maximum) => draws.shift()! % maximum,
  });

  expect(selected).toHaveLength(5);
  expect(new Set(selected).size).toBe(5);
  expect(selected.every((id) => id.startsWith("eligible-"))).toBe(true);
});

test("fails clearly when fewer than five candidates are available", () => {
  expect(() =>
    selectRandomCanaryIds(
      Array.from({ length: 4 }, (_, index) => record(`eligible-${index}`)),
    ),
  ).toThrow("at least five");
});

test("deterministically selects a representative seven-project pool", () => {
  const records = [
    record("a-fill", { kind: "extension" }),
    record("b-fill", { kind: "extension" }),
    record("c-fill", { kind: "extension" }),
    record("d-fill", { kind: "extension" }),
    record("e-fill", { kind: "extension" }),
    record("x-preset", { kind: "preset" }),
    record("y-readme", { kind: "extension" }),
    record("z-description", { kind: "extension" }),
  ];
  const snapshots = Object.fromEntries(
    records.map(({ id }) => [
      id,
      {
        project_id: id,
        source_health: "healthy",
        stale_since: null,
        repository: {
          description:
            id === "z-description"
              ? "A repository description."
              : id === "y-readme"
                ? null
                : "Filler description.",
        },
      },
    ]),
  );

  const first = selectRepresentativeCanaryIds(records, snapshots);
  const second = selectRepresentativeCanaryIds(
    [...records].reverse(),
    snapshots,
  );

  expect(first).toEqual([
    "a-fill",
    "y-readme",
    "x-preset",
    "b-fill",
    "c-fill",
    "d-fill",
    "e-fill",
  ]);
  expect(second).toEqual(first);
});

test("honors pending versus all-automatic selection without weakening manual locks", () => {
  const records = [
    ...Array.from({ length: 5 }, (_, index) =>
      record(`pending-${index}`, { kind: "extension" }),
    ),
    record("curated-preset", {
      kind: "preset",
      metadata_status: "curated",
      summary: "A complete editorial description.",
    }),
    record("manual-github", {
      kind: "preset",
      metadata_status: "curated",
      enrichment_policy: "manual",
      enrichment_note: "Requires review.",
    }),
  ];
  const snapshots = Object.fromEntries(
    records.map(({ id }) => [
      id,
      {
        project_id: id,
        source_health: "healthy",
        stale_since: null,
        repository: { description: `Description for ${id}.` },
      },
    ]),
  );

  expect(
    selectRepresentativeCanaryIds(records, snapshots, {
      selectionMode: "pending",
    }),
  ).not.toContain("curated-preset");
  expect(
    selectRepresentativeCanaryIds(records, snapshots, {
      selectionMode: "all-automatic",
    }),
  ).toContain("curated-preset");
  expect(
    selectRepresentativeCanaryIds(records, snapshots, {
      selectionMode: "all-automatic",
    }),
  ).not.toContain("manual-github");
});
