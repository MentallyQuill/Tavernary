import { expect, test } from "vitest";

import { buildCatalog } from "../../scripts/catalog/build.mjs";

function countBy<T>(items: T[], selector: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = selector(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

const fixtureProject = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  id: "fixture",
  name: "Fixture",
  kind: "preset",
  summary: "Fixture summary.",
  metadata_status: "provisional",
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
  schema_version: 2,
  project_id: "fixture",
  source_health: "healthy",
  repository: {
    id: 123,
    owner: "example",
    name: "fixture",
    url: "https://github.com/example/fixture",
    default_branch: "main",
    head_sha: "a".repeat(40),
    head_committed_at: null,
    archived: false,
    created_at: "2026-01-01T00:00:00.000Z",
    size_kb: 456,
  },
  activity: {
    latest_source_activity_at: "2026-07-23T00:00:00.000Z",
    source_weeks: [],
    provisional_weeks: [
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
    latest_release_at: "2026-07-23T00:00:00.000Z",
    evidence_status: "provisional",
    baseline_completed_at: null,
    baseline_attempts: 0,
  },
  community: {
    stargazers_count: 1,
    forks_count: 2,
    subscribers_count: 3,
  },
  license: {
    status: "osi-approved",
    spdx_id: "MIT",
  },
  refreshed_at: "2026-07-24T00:00:00.000Z",
  stale_since: null,
  ...overrides,
});

test("derives temporary browser activity from version two evidence", async () => {
  const record = fixtureProject({
    kind: "extension",
    source: {
      type: "github",
      repository: "example/fixture",
      repository_id: 123,
    },
  });
  const provisional = fixtureSnapshot({
    activity: {
      ...fixtureSnapshot().activity,
      provisional_weeks: [
        true,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        true,
      ],
    },
  });
  const catalog = await buildCatalog({
    write: false,
    now: "2026-07-24T00:00:00.000Z",
    records: [record],
    snapshots: [provisional],
  });

  expect(catalog.projects[0].activity).toEqual({
    latestSourceActivityAt: "2026-07-23T00:00:00.000Z",
    activeWeeks12: 4,
    weeklyActivity: [
      true,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      true,
    ],
    evidenceStatus: "provisional",
    dormant: false,
  });
});

test("derives complete browser activity from fixed source weeks", async () => {
  const record = fixtureProject({
    kind: "extension",
    source: {
      type: "github",
      repository: "example/fixture",
      repository_id: 123,
    },
  });
  const complete = fixtureSnapshot({
    repository: {
      ...fixtureSnapshot().repository,
      head_committed_at: "2026-07-23T00:00:00.000Z",
    },
    activity: {
      ...fixtureSnapshot().activity,
      source_weeks: [
        {
          week_start: "2026-07-20",
          latest_at: "2026-07-23T00:00:00.000Z",
          precision: "exact",
        },
        {
          week_start: "2026-06-29",
          latest_at: "2026-07-01T00:00:00.000Z",
          precision: "exact",
        },
      ],
      provisional_weeks: null,
      evidence_status: "complete",
      baseline_completed_at: "2026-07-24T00:00:00.000Z",
    },
  });
  const catalog = await buildCatalog({
    write: false,
    now: "2026-07-24T00:00:00.000Z",
    records: [record],
    snapshots: [complete],
  });

  expect(catalog.projects[0].activity).toEqual({
    latestSourceActivityAt: "2026-07-23T00:00:00.000Z",
    activeWeeks12: 2,
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
      false,
      false,
      true,
    ],
    evidenceStatus: "complete",
    dormant: false,
  });
});

test("publishes snapshotless github records with pending source facts", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [
      fixtureProject({
        kind: "extension",
        source: {
          type: "github",
          repository: "example/fixture",
          repository_id: null,
        },
      }),
    ],
    snapshots: [],
  });

  expect(catalog.projects).toEqual([
    expect.objectContaining({
      id: "fixture",
      kind: "extension",
      canonicalUrl: "https://github.com/example/fixture",
      metadataStatus: "provisional",
      sourceStatus: "pending",
      activity: {
        latestSourceActivityAt: null,
        activeWeeks12: null,
        weeklyActivity: null,
        evidenceStatus: null,
        dormant: false,
      },
      latestReleaseAt: null,
      community: null,
      repositorySizeKb: null,
      license: {
        status: "pending",
        label: "Pending",
        tooltip: "Repository facts are pending the first successful snapshot.",
      },
      refreshedAt: null,
      staleSince: null,
    }),
  ]);
});

test("keeps stale github facts public when the snapshot is unavailable", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [
      fixtureProject({
        kind: "extension",
        source: {
          type: "github",
          repository: "example/fixture",
          repository_id: 123,
        },
      }),
    ],
    snapshots: [
      fixtureSnapshot({
        source_health: "unavailable",
        stale_since: "2026-07-24T00:00:00.000Z",
      }),
    ],
  });

  expect(catalog.projects).toEqual([
    expect.objectContaining({
      id: "fixture",
      sourceStatus: "stale",
      canonicalUrl: "https://github.com/example/fixture",
      community: {
        stars: 1,
        forks: 2,
        subscribers: 3,
        aggregate: 6,
      },
      repositorySizeKb: 456,
      staleSince: "2026-07-24T00:00:00.000Z",
      refreshedAt: "2026-07-24T00:00:00.000Z",
      license: {
        status: "osi-approved",
        label: "MIT",
        tooltip: "OSI-approved license detected in the repository root.",
      },
    }),
  ]);
});

test("publishes github organizations as manual-source public projects", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [
      fixtureProject({
        kind: "extension",
        source: {
          type: "github-organization",
          organization: "example",
          url: "https://github.com/example",
        },
      }),
    ],
    snapshots: [],
  });

  expect(catalog.projects).toEqual([
    expect.objectContaining({
      id: "fixture",
      kind: "extension",
      canonicalUrl: "https://github.com/example",
      metadataStatus: "provisional",
      sourceStatus: "manual",
      activity: {
        latestSourceActivityAt: null,
        activeWeeks12: null,
        weeklyActivity: null,
        evidenceStatus: null,
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
      preset: null,
      refreshedAt: null,
      staleSince: null,
    }),
  ]);
});

test("keeps URL presets public with manual source and pending license display", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [
      fixtureProject({
        source: {
          type: "url",
          url: "https://example.com/fixture",
          published_at: null,
          version: null,
          artifact_size_bytes: null,
          license_status: "pending",
          license_spdx_id: null,
        },
      }),
    ],
    snapshots: [],
  });

  expect(catalog.projects).toEqual([
    expect.objectContaining({
      id: "fixture",
      metadataStatus: "provisional",
      sourceStatus: "manual",
      license: {
        status: "pending",
        label: "Pending",
        tooltip: "License review is pending for this source.",
      },
    }),
  ]);
});

test("builds 214 public cards without leaking intake-only metadata", async () => {
  const catalog = await buildCatalog({ write: false });
  expect(catalog.projects).toHaveLength(214);
  expect(
    catalog.projects.filter(
      (project) => project.metadataStatus === "provisional",
    ),
  ).toHaveLength(209);
  expect(catalog.projects.map((project) => project.id)).toContain(
    "purrfect-logic-4-max-mini",
  );
  expect(catalog.projects.map(({ id }) => id)).toEqual(
    [...catalog.projects.map(({ id }) => id)].sort(),
  );
  const sourceStatuses = countBy(
    catalog.projects,
    (project) => project.sourceStatus,
  );
  expect(Object.keys(sourceStatuses).sort()).toEqual([
    "healthy",
    "manual",
    "pending",
  ]);
  expect(sourceStatuses.manual).toBe(10);
  expect(sourceStatuses.healthy + sourceStatuses.pending).toBe(204);
  expect(sourceStatuses.healthy).toBeGreaterThanOrEqual(4);
  expect(
    countBy(catalog.projects, (project) => project.primaryFunction),
  ).toEqual({
    uncategorized: 209,
    "generation-reasoning": 3,
    "interface-workflow": 1,
    frontend: 1,
  });
  const recursion = catalog.projects.find(
    ({ id }) => id === "mentallyquill-recursion",
  );
  expect(catalog.schemaVersion).toBe(2);
  expect(recursion?.activity.weeklyActivity).toHaveLength(12);
  expect(recursion?.activity.weeklyActivity?.filter(Boolean)).toHaveLength(
    recursion?.activity.activeWeeks12 ?? 0,
  );
  expect(recursion?.community?.aggregate).toBe(
    (recursion?.community?.stars ?? 0) +
      (recursion?.community?.forks ?? 0) +
      (recursion?.community?.subscribers ?? 0),
  );
  const labels = catalog.projects.flatMap((project) => [
    ...project.frontends,
    ...project.capabilities,
  ]);
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every(({ description }) => description.length > 0)).toBe(true);
  expect(labels.find(({ id }) => id === "sillytavern")?.description).toBe(
    "Works with the SillyTavern roleplay frontend.",
  );
  expect(JSON.stringify(catalog)).not.toContain("submitted_at");
  expect(JSON.stringify(catalog)).not.toContain("submission");
  expect(JSON.stringify(catalog)).not.toContain('"status":"candidate"');
  expect(JSON.stringify(catalog)).not.toContain("catalog_intake");
});

test("excludes curator and source quarantine states", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [
      fixtureProject({ id: "disabled", visibility: "disabled" }),
      fixtureProject({ id: "identity-change", kind: "extension" }),
      fixtureProject({ id: "deleted", kind: "extension" }),
      fixtureProject({ id: "private", kind: "extension" }),
    ],
    snapshots: [
      fixtureSnapshot({
        project_id: "identity-change",
        source_health: "identity-change",
      }),
      fixtureSnapshot({
        project_id: "deleted",
        source_health: "deleted",
      }),
      fixtureSnapshot({
        project_id: "private",
        source_health: "private",
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
