import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { buildCatalog } from "../../scripts/catalog/build.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function readJsonDirectory<T>(relativePath: string): Promise<T[]> {
  const directory = resolve(rootDirectory, relativePath);
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(directory, file), "utf8")),
    ),
  );
}

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
  schema_version: 3,
  provider: "github",
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
    stars_count: 1,
    forks_count: 2,
    watchers_count: 3,
    aggregate: 6,
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
        owner: { provider: "github", login: "example" },
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
    owner: { provider: "github", login: "example" },
    contributors: [
      { provider: "github", login: "Alice", botOrAi: false },
      { provider: "github", login: "Claude", botOrAi: true },
      { provider: "github", login: "dependabot[bot]", botOrAi: true },
    ],
    humanContributorCount: 1,
    status: "current",
  });
  expect(catalog.projects[0].searchableText).toContain(
    "example github alice claude dependabot[bot]",
  );
});

test("builds partial fork attribution only from observed merged PR authors", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [
      fixtureProject({
        source: {
          type: "github",
          repository: "aikohanasaki/Aikobots",
          repository_id: 123,
        },
      }),
    ],
    snapshots: [
      fixtureSnapshot({
        repository: {
          ...fixtureSnapshot().repository,
          owner: "aikohanasaki",
          name: "Aikobots",
          fork: true,
        },
        contributors: {
          accounts: [
            { login: "aikohanasaki", type: "User" },
            { login: "LeRobber", type: "User" },
          ],
          method: "merged-pull-requests",
          baseline_completed_at: null,
          scan: {
            next_page: 3,
            cutoff_at: null,
            target_watermark: "2026-07-27T00:00:00.000Z",
          },
          refreshed_at: "2026-07-27T00:00:00.000Z",
          stale_since: null,
        },
      }),
    ],
  });

  expect(catalog.projects[0].attribution).toEqual({
    owner: { provider: "github", login: "aikohanasaki" },
    contributors: [{ provider: "github", login: "LeRobber", botOrAi: false }],
    humanContributorCount: 1,
    status: "partial",
  });
  expect(catalog.projects[0].searchableText).not.toContain("cohee1207");
});

test("resolves a published immediate fork parent into browser-safe data", async () => {
  const child = fixtureProject({
    id: "child",
    name: "Child",
    kind: "extension",
    source: {
      type: "github",
      repository: "example/child",
      repository_id: 1000,
    },
  });
  const parent = fixtureProject({
    id: "parent",
    name: "Curated Parent",
    kind: "extension",
    source: {
      type: "github",
      repository: "upstream/parent",
      repository_id: 9001,
    },
  });
  const childSnapshot = fixtureSnapshot({
    project_id: "child",
    repository: {
      ...fixtureSnapshot().repository,
      id: 1000,
      name: "child",
      fork: true,
      parent: {
        id: 9001,
        owner: "upstream",
        name: "parent",
        url: "https://github.com/upstream/parent",
      },
    },
  });

  const catalog = await buildCatalog({
    write: false,
    records: [child, parent],
    snapshots: [childSnapshot],
  });

  expect(catalog.projects.find(({ id }) => id === "child")?.fork).toEqual({
    parentName: "Curated Parent",
    parentProjectId: "parent",
    status: "published",
  });
});

test("keeps a disabled fork parent name without exposing a link or coordinates", async () => {
  const child = fixtureProject({
    id: "child",
    kind: "extension",
    source: {
      type: "github",
      repository: "example/child",
      repository_id: 1000,
    },
  });
  const parent = fixtureProject({
    id: "parent",
    name: "Curated Parent",
    visibility: "disabled",
    kind: "extension",
    source: {
      type: "github",
      repository: "private-owner/private-parent",
      repository_id: 9001,
    },
  });
  const childSnapshot = fixtureSnapshot({
    project_id: "child",
    repository: {
      ...fixtureSnapshot().repository,
      id: 1000,
      fork: true,
      parent: {
        id: 9001,
        owner: "private-owner",
        name: "private-parent",
        url: "https://github.com/private-owner/private-parent",
      },
    },
  });

  const catalog = await buildCatalog({
    write: false,
    records: [child, parent],
    snapshots: [childSnapshot],
  });
  const relationship = catalog.projects[0].fork;

  expect(relationship).toEqual({
    parentName: "Curated Parent",
    parentProjectId: null,
    status: "not-listed",
  });
  expect(JSON.stringify(relationship)).not.toMatch(
    /private-owner|private-parent|github\.com|9001/,
  );
});

test("keeps unknown fork provenance name-only and emits null for non-forks", async () => {
  const child = fixtureProject({
    id: "child",
    kind: "extension",
    source: {
      type: "github",
      repository: "example/child",
      repository_id: 1000,
    },
  });
  const ordinary = fixtureProject({
    id: "ordinary",
    kind: "extension",
    source: {
      type: "github",
      repository: "example/ordinary",
      repository_id: 2000,
    },
  });
  const childSnapshot = fixtureSnapshot({
    project_id: "child",
    repository: {
      ...fixtureSnapshot().repository,
      id: 1000,
      fork: true,
      parent: {
        id: 9001,
        owner: "unknown-owner",
        name: "Unknown Parent",
        url: "https://github.com/unknown-owner/unknown-parent",
      },
    },
  });

  const catalog = await buildCatalog({
    write: false,
    records: [child, ordinary],
    snapshots: [childSnapshot],
  });

  expect(catalog.projects.find(({ id }) => id === "child")?.fork).toEqual({
    parentName: "Unknown Parent",
    parentProjectId: null,
    status: "not-listed",
  });
  expect(catalog.projects.find(({ id }) => id === "ordinary")?.fork).toBeNull();
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
        watchers: 3,
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

test("publishes provider-qualified Codeberg evidence", async () => {
  const record = fixtureProject({
    id: "targren-lumiverse-swipescrubber",
    name: "Swipe Scrubber",
    kind: "extension",
    source: {
      type: "codeberg",
      repository: "targren/Lumiverse-SwipeScrubber",
      repository_id: 1699613,
    },
  });
  const snapshot = fixtureSnapshot({
    project_id: record.id,
    provider: "codeberg",
    repository: {
      id: 1699613,
      owner: "targren",
      name: "Lumiverse-SwipeScrubber",
      url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
      default_branch: "master",
      head_sha: "1".repeat(40),
      head_committed_at: "2026-07-21T14:45:42.000Z",
      archived: false,
      created_at: "2026-05-01T00:00:00.000Z",
      size_kb: 409,
    },
    community: {
      stars_count: 0,
      forks_count: 0,
      watchers_count: 1,
      aggregate: 1,
    },
    contributors: {
      accounts: [{ provider: "codeberg", login: "helper", type: "User" }],
      method: "commit-and-merged-pull-request-authors",
      baseline_completed_at: "2026-07-24T00:00:00.000Z",
      scan: null,
      refreshed_at: "2026-07-24T00:00:00.000Z",
      stale_since: null,
    },
  });

  const catalog = await buildCatalog({
    write: false,
    records: [record],
    snapshots: [snapshot],
  });

  expect(catalog.schemaVersion).toBe(3);
  expect(catalog.projects[0]).toMatchObject({
    canonicalUrl: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
    attribution: {
      owner: { provider: "codeberg", login: "targren" },
      contributors: [{ provider: "codeberg", login: "helper", botOrAi: false }],
    },
    community: { stars: 0, forks: 0, watchers: 1, aggregate: 1 },
  });
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

test("keeps URL Frontends public with manual source metadata", async () => {
  const catalog = await buildCatalog({
    write: false,
    records: [
      fixtureProject({
        kind: "frontend",
        frontends: ["sillytavern"],
        primary_function: "frontend",
        source: {
          type: "url",
          url: "https://codeberg.org/example/frontend",
          published_at: null,
          version: null,
          artifact_size_bytes: null,
          license_status: "missing",
          license_spdx_id: null,
        },
      }),
    ],
    snapshots: [],
  });

  expect(catalog.projects).toEqual([
    expect.objectContaining({
      id: "fixture",
      kind: "frontend",
      canonicalUrl: "https://codeberg.org/example/frontend",
      sourceStatus: "manual",
      preset: null,
    }),
  ]);
});

test("builds every eligible public card with consolidated manual sources", async () => {
  const catalog = await buildCatalog({ write: false });
  const [records, snapshots] = await Promise.all([
    readJsonDirectory<{
      id: string;
      kind: string;
      visibility: string;
      source: { type: string };
    }>("data/registry/projects"),
    readJsonDirectory<{ project_id: string; source_health: string }>(
      "data/snapshots/github",
    ),
  ]);
  const snapshotsByProject = new Map(
    snapshots.map((snapshot) => [snapshot.project_id, snapshot]),
  );
  const hiddenSourceStates = new Set(["identity-change", "deleted", "private"]);
  const expectedProjectIds = records
    .filter((record) => {
      const snapshot = snapshotsByProject.get(record.id);
      return (
        record.visibility === "published" &&
        !(snapshot && hiddenSourceStates.has(snapshot.source_health)) &&
        (record.source.type !== "url" ||
          record.kind === "preset" ||
          record.kind === "frontend")
      );
    })
    .map(({ id }) => id)
    .sort();

  expect(catalog.projects.map(({ id }) => id)).toEqual(expectedProjectIds);
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
  expect(
    (sourceStatuses.healthy ?? 0) +
      (sourceStatuses.pending ?? 0) +
      (sourceStatuses.stale ?? 0),
  ).toBe(catalog.projects.length - (sourceStatuses.manual ?? 0));
  expect(sourceStatuses.healthy ?? 0).toBeGreaterThanOrEqual(4);
  expect(catalog.projects.map(({ id }) => id)).not.toEqual(
    expect.arrayContaining([
      "village-maker-anonpaste-prompt",
      "village-maker-harrow-hundred-prompt",
      "village-maker-thornbeck-prompt",
    ]),
  );
  expect(
    catalog.projects.find(
      ({ id }) => id === "village-maker-google-drive-prompt",
    ),
  ).toMatchObject({
    canonicalUrl:
      "https://www.reddit.com/r/SillyTavernAI/comments/1v3rfm4/village_maker_v10_dating_sim_cards_thornbeck/",
    metadataStatus: "curated",
    primaryFunction: "character-worldbuilding",
  });
  expect(
    catalog.projects.find(({ id }) => id === "tavern-rpg-suite"),
  ).toMatchObject({
    canonicalUrl: "https://github.com/tavern-rpg-suite",
    metadataStatus: "curated",
    primaryFunction: "rpg-systems",
  });
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
  expect(catalog.schemaVersion).toBe(3);
  expect(recursion?.activity.weeklyActivity).toHaveLength(12);
  expect(recursion?.activity.weeklyActivity?.filter(Boolean)).toHaveLength(
    recursion?.activity.activeWeeks12 ?? 0,
  );
  expect(recursion?.community?.aggregate).toBe(
    (recursion?.community?.stars ?? 0) +
      (recursion?.community?.forks ?? 0) +
      (recursion?.community?.watchers ?? 0),
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
  expect(catalog.projects[0]).not.toHaveProperty("enrichmentPolicy");
  expect(catalog.projects[0]).not.toHaveProperty("enrichmentNote");
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
      model_families: ["claude"],
      completion_formats: ["chat-completion"],
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
    siteConfig: { github_repository: "fixture-owner/fixture-repository" },
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
    schemaVersion: 3,
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
        sourceIssueNumber: 41,
        sourceIssueUrl:
          "https://github.com/fixture-owner/fixture-repository/issues/41",
        frontends: [expect.objectContaining({ id: "sillytavern" })],
        modelFamilies: [expect.objectContaining({ id: "claude" })],
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
  expect(catalog.kits[1]).not.toHaveProperty("tavernaryPick");
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
