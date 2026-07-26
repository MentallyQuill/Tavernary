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
  schema_version: 3,
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
  visibility_reason: null,
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

const fixtureKit = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  id: "story-kit-41",
  status: "published",
  title: "Story Kit",
  description: "A compact story stack.",
  author: { github_user_id: 123, login: "author" },
  source_issue_number: 41,
  project_ids: ["frontend", "memory", "preset"],
  published_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
  tavernary_pick: false,
  ...overrides,
});

const fixtureKitSnapshot = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  kit_id: "story-kit-41",
  source_issue_number: 41,
  refreshed_at: "2026-07-25T00:00:00.000Z",
  stale_since: null,
  supporters: [
    {
      github_user_id: 123,
      login: "author",
      first_reacted_at: "2026-07-23T00:00:00.000Z",
      active: true,
    },
    {
      github_user_id: 456,
      login: "supporter",
      first_reacted_at: "2026-07-25T00:00:00.000Z",
      active: true,
    },
  ],
  ...overrides,
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
      attribution: {
        owner: "example",
        contributors: [],
        humanContributorCount: 0,
        status: "pending",
      },
      refreshedAt: null,
      staleSince: null,
    }),
  ]);
});

test("builds searchable owner and contributor attribution from GitHub facts", async () => {
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
        contributors: {
          accounts: [
            { login: "example", type: "User" },
            { login: "Alice", type: "User" },
            { login: "Claude", type: "User" },
            { login: "dependabot[bot]", type: "Bot" },
          ],
          refreshed_at: "2026-07-25T00:00:00.000Z",
          stale_since: null,
        },
      }),
    ],
  });

  expect(catalog.projects[0].attribution).toEqual({
    owner: "example",
    contributors: [
      { login: "Alice", botOrAi: false },
      { login: "Claude", botOrAi: true },
      { login: "dependabot[bot]", botOrAi: true },
    ],
    humanContributorCount: 1,
    status: "current",
  });
  expect(catalog.projects[0].searchableText).toContain(
    "example alice claude dependabot[bot]",
  );
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
      attribution: null,
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
      attribution: null,
    }),
  ]);
});

test("builds 214 public cards without leaking intake-only metadata", async () => {
  const catalog = await buildCatalog({ write: false });
  expect(catalog.projects).toHaveLength(214);
  expect(
    catalog.projects.every((project) =>
      ["curated", "provisional"].includes(project.metadataStatus),
    ),
  ).toBe(true);
  expect(
    catalog.projects.filter((project) => project.metadataStatus === "curated")
      .length,
  ).toBeGreaterThanOrEqual(5);
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
  const supportedSourceStatuses = ["healthy", "manual", "pending", "stale"];
  expect(
    Object.keys(sourceStatuses).every((status) =>
      supportedSourceStatuses.includes(status),
    ),
  ).toBe(true);
  expect(sourceStatuses.manual).toBe(10);
  expect(
    (sourceStatuses.healthy ?? 0) +
      (sourceStatuses.pending ?? 0) +
      (sourceStatuses.stale ?? 0),
  ).toBe(204);
  expect(sourceStatuses.healthy ?? 0).toBeGreaterThanOrEqual(4);
  expect(
    catalog.projects
      .filter((project) => project.metadataStatus === "curated")
      .every(
        (project) =>
          project.primaryFunction !== "uncategorized" ||
          (project.summary === "No README file found." &&
            project.capabilities.length === 0),
      ),
  ).toBe(true);
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

test("builds Kits from complete project records and nullable support", async () => {
  const records = [
    fixtureProject({
      id: "frontend",
      name: "Frontend",
      kind: "frontend",
      frontends: ["sillytavern"],
      primary_function: "frontend",
    }),
    fixtureProject({
      id: "memory",
      name: "Memory",
      kind: "extension",
      primary_function: "memory-retrieval",
      source: {
        type: "github",
        repository: "example/memory",
        repository_id: 2,
      },
    }),
    fixtureProject({
      id: "preset",
      name: "Preset",
      kind: "preset",
      primary_function: "generation-reasoning",
    }),
    fixtureProject({
      id: "flagged",
      name: "Flagged",
      kind: "extension",
      visibility: "quarantined",
      visibility_reason: "safety-review",
      source: {
        type: "github",
        repository: "example/flagged",
        repository_id: 3,
      },
    }),
  ];
  const catalog = await buildCatalog({
    write: false,
    now: "2026-07-25T00:00:00.000Z",
    records,
    snapshots: [],
    kitRecords: [
      fixtureKit(),
      fixtureKit({
        id: "flagged-kit-42",
        source_issue_number: 42,
        project_ids: ["frontend", "memory", "flagged"],
      }),
      fixtureKit({
        id: "withdrawn-kit-43",
        status: "withdrawn",
        source_issue_number: 43,
        withdrawn_at: "2026-07-25T00:00:00.000Z",
      }),
    ],
    kitSnapshots: [fixtureKitSnapshot()],
    blockedUsers: { schema_version: 1, blocked: [] },
  });

  expect(catalog).toMatchObject({
    schemaVersion: 2,
    kits: [
      {
        id: "flagged-kit-42",
        components: [
          expect.objectContaining({ projectId: "frontend" }),
          expect.objectContaining({ projectId: "memory" }),
          expect.objectContaining({
            projectId: "flagged",
            name: "Flagged",
            kind: "extension",
            availability: "flagged",
            unavailableReason: "safety-review",
            canonicalUrl: null,
          }),
        ],
        supporterCount: null,
        trendingScore: null,
      },
      {
        id: "story-kit-41",
        frontends: [expect.objectContaining({ id: "sillytavern" })],
        purposes: [
          expect.objectContaining({ id: "memory-retrieval" }),
          expect.objectContaining({ id: "generation-reasoning" }),
        ],
        supporterCount: 2,
        supportStale: false,
      },
    ],
  });
  expect(catalog.kits[1]?.components[0]).toMatchObject({
    projectId: "frontend",
    availability: "available",
  });
  expect(catalog.projects.map(({ id }) => id)).not.toContain("flagged");
  expect(catalog.kits.map(({ id }) => id)).not.toContain("withdrawn-kit-43");
});

test("uses the refresh manifest for deterministic generated output", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [fixtureProject()],
    snapshots: [],
    refreshManifest: {
      completed_at: "2026-07-24T08:30:00.000Z",
    },
  });

  expect(catalog.generatedAt).toBe("2026-07-24T08:30:00.000Z");
});
