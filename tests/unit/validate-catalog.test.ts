import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { validateCatalog as validateCatalogRaw } from "../../scripts/catalog/validate.mjs";

const validRecord = {
  schema_version: 6,
  id: "valid-preset",
  source_id: "github-1",
  name: "Valid Preset",
  kind: "preset",
  summary: "A valid test fixture.",
  metadata_status: "curated",
  frontends: ["sillytavern"],
  primary_function: "preset",
  tags: ["guide-model-responses"],
  model_families: ["claude"],
  completion_formats: ["chat-completion"],
  cataloged_at: "2026-07-23T00:00:00Z",
  catalog_cohort: "seed",
  listing_status: "active",
  listing_status_reason: null,
  metadata_policy: {
    summary: { mode: "automatic" },
    tags: { mode: "automatic" },
  },
};

const validSnapshotV2: Record<string, any> = {
  schema_version: 4,
  provider: "github",
  source_id: "github-1",
  repository: {
    id: 1,
    owner: "example",
    name: "valid-preset",
    url: "https://github.com/example/valid-preset",
    default_branch: "main",
    head_sha: "a".repeat(40),
    head_committed_at: "2026-07-23T00:00:00.000Z",
    archived: false,
    created_at: "2026-01-01T00:00:00.000Z",
    size_kb: 10,
  },
  source_health: "healthy",
  activity: {
    latest_source_activity_at: "2026-07-23T00:00:00.000Z",
    source_weeks: [
      {
        week_start: "2026-07-20",
        latest_at: "2026-07-23T00:00:00.000Z",
        precision: "exact",
      },
    ],
    provisional_weeks: null,
    latest_release_at: null,
    evidence_status: "complete",
    baseline_completed_at: "2026-07-24T00:00:00.000Z",
    baseline_attempts: 1,
  },
  community: {
    stars_count: 3,
    forks_count: 2,
    watchers_count: 1,
    aggregate: 6,
  },
  license: {
    status: "osi-approved",
    spdx_id: "MIT",
    source_path: "LICENSE",
  },
  refreshed_at: "2026-07-24T00:00:00.000Z",
  stale_since: null,
};

const validSourceV1 = {
  schema_version: 1,
  id: "github-1",
  type: "github",
  repository: "example/valid-preset",
  repository_id: 1,
  status: "active",
  status_reason: null,
  refresh_policy: "automatic",
};

const {
  model_families: _validModelFamilies,
  completion_formats: _validCompletionFormats,
  ...validRecordWithoutPresetFields
} = validRecord;
const validRecordV6 = {
  ...validRecordWithoutPresetFields,
  id: "valid-extension",
  source_id: validSourceV1.id,
  name: "Valid Extension",
  kind: "extension",
  summary: "A valid source-backed test fixture.",
  metadata_status: "curated",
  frontends: ["sillytavern"],
  primary_function: "interface-workflow",
  tags: [],
};

const validSnapshotV4 = structuredClone(validSnapshotV2);
const emptyCounts = {
  total: 0,
  checked: 0,
  changed: 0,
  unchanged: 0,
  provisional: 0,
  degraded: 0,
  unavailable: 0,
  failed: 0,
  compared: 0,
  baseline: 0,
  fallback: 0,
};
const emptyProvider = {
  checked: 0,
  changed: 0,
  failed: 0,
  requests: 0,
  remaining: null,
};
const validRefreshManifest = {
  schema_version: 3,
  mode: "incremental",
  started_at: "2026-07-29T00:00:00Z",
  completed_at: "2026-07-29T00:00:00Z",
  counts: emptyCounts,
  api: {
    graphql_requests: 0,
    graphql_points: 0,
    graphql_remaining: null,
    rest_requests: 0,
  },
  providers: {
    github: emptyProvider,
    codeberg: emptyProvider,
  },
  duration_ms: 0,
  source_timings: [],
  snapshot_changes: false,
  deployment_requested: false,
};

function validateCatalog(options?: Parameters<typeof validateCatalogRaw>[0]) {
  if (options === undefined) return validateCatalogRaw();
  return validateCatalogRaw({
    sources: [validSourceV1],
    snapshots: [],
    refreshManifest: validRefreshManifest,
    ...options,
  });
}

describe("catalog validation", () => {
  test("accepts optional curated project aliases", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecordV6,
          aliases: ["Memory Companion", "Durable Memory"],
        },
      ],
      sources: [validSourceV1],
      snapshots: [validSnapshotV4],
    });

    expect(result.errors).toEqual([]);
  });

  test("rejects an invalid Goals-and-Traits vocabulary", async () => {
    const result = await validateCatalog({
      records: [],
      tagVocabulary: {
        schema_version: 1,
        tags: [],
        injected: true,
      },
    });

    expect(result.errors.join("\n")).toContain(
      "tags-vocabulary: schema / must NOT have additional properties",
    );
  });

  test("rejects semantic tag vocabulary collisions", async () => {
    const tag = {
      id: "maintain-long-term-memory",
      label: "Maintain long-term memory",
      facet: "goal",
      description: "Preserve durable conversation context.",
      aliases: ["memory"],
      applicable_kinds: ["extension"],
      inclusion_guidance: ["Requires explicit durable memory behavior."],
      exclusion_guidance: ["Exclude ordinary history display."],
    };
    const result = await validateCatalog({
      records: [],
      tagVocabulary: {
        schema_version: 1,
        tags: [tag, { ...tag, label: "Persistent memory", aliases: [] }],
      },
    });

    expect(result.errors).toContain(
      "tags-vocabulary: tags[1].id duplicates tag ID maintain-long-term-memory.",
    );
  });

  test("accepts sibling v6 cards sharing one source and reports a missing source", async () => {
    const sibling = {
      ...validRecordV6,
      id: "valid-preset-sibling",
      name: "Valid Preset Sibling",
      kind: "preset",
      primary_function: "preset",
      model_families: ["claude"],
      completion_formats: ["chat-completion"],
    };
    const valid = await validateCatalog({
      records: [validRecordV6, sibling],
      sources: [validSourceV1],
      snapshots: [validSnapshotV4],
    });

    expect(valid.errors).toEqual([]);

    const missing = await validateCatalog({
      records: [validRecordV6, sibling],
      sources: [],
      snapshots: [validSnapshotV4],
    });
    expect(missing.errors).toContain(
      "valid-extension: source github-1 does not exist",
    );
  });

  test("accepts the production catalog at its current Kit counts", async () => {
    const countJsonFiles = async (directory: string) =>
      (await readdir(resolve(directory))).filter((file) =>
        file.endsWith(".json"),
      ).length;
    const result = await validateCatalog();

    expect(result.errors).toEqual([]);
    expect(result.projectCount).toBe(
      await countJsonFiles("data/registry/projects"),
    );
    expect(result.kitCount).toBe(await countJsonFiles("data/registry/kits"));
    expect(result.kitSnapshotCount).toBe(
      await countJsonFiles("data/snapshots/github/kits"),
    );
  });

  test("accepts matching Codeberg records and snapshots", async () => {
    const {
      model_families: _modelFamilies,
      completion_formats: _completionFormats,
      ...extensionBase
    } = validRecord;
    const record = {
      ...extensionBase,
      id: "targren-lumiverse-swipescrubber",
      source_id: "codeberg-1699613",
      kind: "extension",
      primary_function: "interface-workflow",
      tags: [],
    };
    const source = {
      schema_version: 1,
      id: "codeberg-1699613",
      type: "codeberg",
      repository: "targren/Lumiverse-SwipeScrubber",
      repository_id: 1699613,
      status: "active",
      status_reason: null,
      refresh_policy: "automatic",
    };
    const snapshot = {
      ...validSnapshotV2,
      provider: "codeberg",
      source_id: source.id,
      repository: {
        ...validSnapshotV2.repository,
        id: 1699613,
        owner: "targren",
        name: "Lumiverse-SwipeScrubber",
        url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
      },
      contributors: {
        accounts: [{ provider: "codeberg", login: "helper", type: "User" }],
        method: "commit-and-merged-pull-request-authors",
        baseline_completed_at: "2026-07-24T00:00:00.000Z",
        scan: null,
        refreshed_at: "2026-07-24T00:00:00.000Z",
        stale_since: null,
      },
    };

    const result = await validateCatalog({
      records: [record],
      sources: [source],
      snapshots: [snapshot],
    });
    expect(result.errors).toEqual([]);
  });

  test.each([
    [
      "duplicate IDs",
      {
        schema_version: 1,
        editors: [
          { github_user_id: 42, login: "EditorOne", role: "owner" },
          { github_user_id: 42, login: "EditorTwo", role: "maintainer" },
        ],
      },
      "GitHub user IDs must be unique",
    ],
    [
      "duplicate logins",
      {
        schema_version: 1,
        editors: [
          { github_user_id: 42, login: "EditorOne", role: "owner" },
          { github_user_id: 43, login: "editorone", role: "admin" },
        ],
      },
      "logins must be unique case-insensitively",
    ],
    [
      "invalid ID",
      {
        schema_version: 1,
        editors: [{ github_user_id: 0, login: "EditorOne", role: "owner" }],
      },
      "GitHub user ID must be a positive integer",
    ],
    [
      "invalid role",
      {
        schema_version: 1,
        editors: [
          { github_user_id: 42, login: "EditorOne", role: "contributor" },
        ],
      },
      "role is invalid",
    ],
  ])(
    "rejects a trusted-editor registry with %s",
    async (_label, registry, message) => {
      const result = await validateCatalog({
        records: [validRecord],
        snapshots: [],
        trustedEditors: registry,
      });

      expect(result.errors.join("\n")).toContain(message);
    },
  );

  test("rejects mismatched and duplicate provider snapshots", async () => {
    const codebergSource = {
      ...validSourceV1,
      id: "codeberg-1",
      type: "codeberg",
    };
    const codebergRecord = {
      ...validRecord,
      source_id: codebergSource.id,
    };
    const result = await validateCatalog({
      records: [codebergRecord],
      sources: [codebergSource],
      snapshots: [
        { ...validSnapshotV4, source_id: codebergSource.id },
        { ...validSnapshotV4, source_id: codebergSource.id },
      ],
    });

    expect(result.errors).toContain(
      "codeberg-1: snapshot provider does not match record source",
    );
    expect(result.errors).toContain(
      "codeberg-1: duplicate repository snapshot",
    );
  });

  test("rejects an invalid global refresh manifest", async () => {
    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [validSnapshotV2],
      refreshManifest: {},
    });

    expect(result.errors).toContain(
      "github-refresh: schema / must have required property 'schema_version'",
    );
  });

  test("rejects a non-GitHub extension", async () => {
    const source = {
      schema_version: 1,
      id: "url-bad-extension",
      type: "url",
      url: "https://example.com/tool",
      published_at: null,
      version: null,
      artifact_size_bytes: null,
      license_status: "missing",
      license_spdx_id: null,
      status: "active",
      status_reason: null,
      refresh_policy: "paused",
    };
    const result = await validateCatalog({
      records: [
        {
          ...validRecordV6,
          id: "bad-extension",
          source_id: source.id,
          name: "Bad Extension",
          summary: "Invalid source fixture.",
          primary_function: "generation-reasoning",
        },
      ],
      sources: [source],
    });

    expect(result.errors).toContain(
      "bad-extension: extension requires a GitHub or Codeberg source",
    );
  });

  test("accepts a manually curated Frontend from a public URL source", async () => {
    const {
      model_families: _modelFamilies,
      completion_formats: _completionFormats,
      ...frontend
    } = validRecord;
    const result = await validateCatalog({
      records: [
        {
          ...frontend,
          id: "codeberg-frontend",
          source_id: "url-codeberg-frontend",
          name: "Codeberg Frontend",
          kind: "frontend",
          primary_function: "frontend",
          tags: [],
        },
      ],
      sources: [
        {
          schema_version: 1,
          id: "url-codeberg-frontend",
          type: "url",
          url: "https://codeberg.org/example/frontend",
          published_at: null,
          version: null,
          artifact_size_bytes: null,
          license_status: "missing",
          license_spdx_id: null,
          status: "active",
          status_reason: null,
          refresh_policy: "paused",
        },
      ],
      snapshots: [],
    });

    expect(result.errors).toEqual([]);
  });

  test("rejects duplicate project and source identities", async () => {
    const result = await validateCatalog({
      records: [validRecord, structuredClone(validRecord)],
      sources: [validSourceV1, structuredClone(validSourceV1)],
    });

    expect(result.errors).toContain("valid-preset: duplicate project id");
    expect(result.errors).toContain("github-1: duplicate source id");
  });

  test("rejects duplicate permanent GitHub repository IDs", async () => {
    const result = await validateCatalog({
      records: [validRecord],
      sources: [
        validSourceV1,
        {
          ...validSourceV1,
          id: "github-2",
          repository: "example/second-preset",
        },
      ],
    });

    expect(result.errors).toContain(
      "github-2: duplicate github repository_id 1",
    );
  });

  test("rejects unknown project vocabulary values", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "bad-vocabulary",
          frontends: ["unknown-frontend"],
          primary_function: "unknown-function",
          tags: ["unknown-tag"],
        },
      ],
    });

    expect(result.errors).toContain(
      "bad-vocabulary: unknown frontend unknown-frontend",
    );
    expect(result.errors).toContain(
      "bad-vocabulary: unknown primary function unknown-function",
    );
    expect(result.errors).toContain("bad-vocabulary: unknown tag unknown-tag");
  });

  test("rejects an unknown Preset model family", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          model_families: ["unknown-family"],
        },
      ],
    });

    expect(result.errors).toContain(
      "valid-preset: unknown model family unknown-family",
    );
  });

  test("accepts Model-Agnostic combined with recommended families", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          model_families: ["model-agnostic", "claude", "glm", "deepseek"],
        },
      ],
    });

    expect(result.errors).toEqual([]);
  });

  test.each([
    ["frontend", "interface-workflow"],
    ["preset", "generation-reasoning"],
    ["extension", "frontend"],
    ["extension", "preset"],
    ["extension", "uncategorized"],
  ])(
    "rejects an invalid %s / %s classification pair",
    async (kind, primaryFunction) => {
      const result = await validateCatalog({
        records: [
          {
            ...validRecord,
            kind,
            primary_function: primaryFunction,
          },
        ],
      });

      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("classification")]),
      );
    },
  );

  test("accepts curated metadata for the paused Tavern RPG Suite organization", async () => {
    const source = {
      schema_version: 1,
      id: "github-organization-tavern-rpg-suite",
      type: "github-organization",
      organization: "tavern-rpg-suite",
      url: "https://github.com/tavern-rpg-suite",
      status: "active",
      status_reason: null,
      refresh_policy: "paused",
    };
    const result = await validateCatalog({
      records: [
        {
          ...validRecordV6,
          id: "tavern-rpg-suite",
          source_id: source.id,
          name: "Tavern RPG Suite",
          summary:
            "A SillyTavern extension suite adding maps, inventory, vitals, equipment, memory, minigames, and secondary-model roleplay tools.",
          primary_function: "rpg-systems",
          tags: ["manage-inventory-and-quests"],
        },
      ],
      sources: [source],
      snapshots: [],
    });

    expect(result.errors).toEqual([]);
  });

  test("requires the Tavern RPG Suite organization source to remain paused", async () => {
    const source = {
      schema_version: 1,
      id: "github-organization-tavern-rpg-suite",
      type: "github-organization",
      organization: "tavern-rpg-suite",
      url: "https://github.com/tavern-rpg-suite",
      status: "active",
      status_reason: null,
      refresh_policy: "automatic",
    };
    const result = await validateCatalog({
      records: [
        {
          ...validRecordV6,
          id: "tavern-rpg-suite",
          source_id: source.id,
          name: "Tavern RPG Suite",
          primary_function: "rpg-systems",
        },
      ],
      sources: [source],
      snapshots: [],
    });

    expect(result.errors.join("\n")).toContain("refresh_policy");
  });

  test("rejects the reserved organization when the exact pair does not match", async () => {
    const source = {
      schema_version: 1,
      id: "github-organization-tavern-rpg-suite",
      type: "github-organization",
      organization: "tavern-rpg-suite",
      url: "https://github.com/tavern-rpg-suite-wrong",
      status: "active",
      status_reason: null,
      refresh_policy: "paused",
    };
    const result = await validateCatalog({
      records: [
        {
          ...validRecordV6,
          id: "tavern-rpg-suite",
          source_id: source.id,
          name: "Tavern RPG Suite",
          primary_function: "rpg-systems",
        },
      ],
      sources: [source],
      snapshots: [],
    });

    expect(result.errors).toContain(
      "github-organization-tavern-rpg-suite: github-organization must identify https://github.com/tavern-rpg-suite",
    );
  });

  test("rejects other github organizations", async () => {
    const source = {
      schema_version: 1,
      id: "github-organization-someone-else",
      type: "github-organization",
      organization: "someone-else",
      url: "https://github.com/someone-else",
      status: "active",
      status_reason: null,
      refresh_policy: "paused",
    };
    const result = await validateCatalog({
      records: [
        {
          ...validRecordV6,
          id: "another-organization",
          source_id: source.id,
          name: "Another Organization",
          primary_function: "rpg-systems",
        },
      ],
      sources: [source],
      snapshots: [],
    });

    expect(result.errors).toContain(
      "github-organization-someone-else: github-organization must identify https://github.com/tavern-rpg-suite",
    );
  });

  test("requires URL sources to use https", async () => {
    const source = {
      schema_version: 1,
      id: "url-unsafe",
      type: "url",
      url: "http://example.com/preset",
      published_at: null,
      version: null,
      artifact_size_bytes: null,
      license_status: "missing",
      license_spdx_id: null,
      status: "active",
      status_reason: null,
      refresh_policy: "paused",
    };
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "unsafe-url",
          source_id: source.id,
        },
      ],
      sources: [source],
    });

    expect(result.errors).toContain(
      "url-unsafe: URL source requires https protocol",
    );
  });

  test("allows automatic metadata policies for an external URL source", async () => {
    const source = {
      schema_version: 1,
      id: "url-reddit-preset",
      type: "url",
      url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update/",
      published_at: null,
      version: null,
      artifact_size_bytes: null,
      license_status: "pending",
      license_spdx_id: null,
      status: "active",
      status_reason: null,
      refresh_policy: "paused",
    };
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "reddit-preset",
          source_id: source.id,
        },
      ],
      sources: [source],
      snapshots: [],
    });

    expect(result.errors).toEqual([]);
  });

  test("accepts complete version two activity evidence", async () => {
    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [validSnapshotV2],
    });

    expect(result.errors).toEqual([]);
    expect(result.snapshotCount).toBe(1);
  });

  test("accepts an optional repository fork fact", async () => {
    const snapshot = structuredClone(validSnapshotV2);
    snapshot.repository.fork = true;

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [snapshot],
    });

    expect(result.errors).toEqual([]);
  });

  test("accepts an optional immediate fork parent", async () => {
    const snapshot = structuredClone(validSnapshotV2);
    snapshot.repository.fork = true;
    snapshot.repository.parent = {
      id: 41,
      owner: "Upstream",
      name: "Parent",
      url: "https://github.com/Upstream/Parent",
    };

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [snapshot],
    });

    expect(result.errors).toEqual([]);
  });

  test("rejects a repository that names itself as its fork parent", async () => {
    const snapshot = structuredClone(validSnapshotV2);
    snapshot.repository.fork = true;
    snapshot.repository.parent = {
      id: snapshot.repository.id,
      owner: snapshot.repository.owner,
      name: snapshot.repository.name,
      url: snapshot.repository.url,
    };

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [snapshot],
    });

    expect(result.errors).toContain(
      "github-1: repository cannot be its own fork parent",
    );
  });

  test("rejects a fork parent on a repository not marked as a fork", async () => {
    const snapshot = structuredClone(validSnapshotV2);
    snapshot.repository.fork = false;
    snapshot.repository.parent = {
      id: 41,
      owner: "Upstream",
      name: "Parent",
      url: "https://github.com/Upstream/Parent",
    };

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [snapshot],
    });

    expect(result.errors).toContain(
      "github-1: non-fork repository cannot have a fork parent",
    );
  });

  test("rejects malformed fork parent coordinates", async () => {
    const snapshot = structuredClone(validSnapshotV2);
    snapshot.repository.fork = true;
    snapshot.repository.parent = {
      id: 41,
      owner: "Upstream/Other",
      name: "Parent",
      url: "https://github.com/Upstream/Parent",
    };

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [snapshot],
    });

    expect(result.errors.some((error) => error.includes("/owner"))).toBe(true);
  });

  test("rejects a non-positive fork parent repository ID", async () => {
    const snapshot = structuredClone(validSnapshotV2);
    snapshot.repository.fork = true;
    snapshot.repository.parent = {
      id: 0,
      owner: "Upstream",
      name: "Parent",
      url: "https://github.com/Upstream/Parent",
    };

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [snapshot],
    });

    expect(result.errors.some((error) => error.includes("/id"))).toBe(true);
  });

  test("rejects extra fork parent properties", async () => {
    const snapshot = structuredClone(validSnapshotV2);
    snapshot.repository.fork = true;
    snapshot.repository.parent = {
      id: 41,
      owner: "Upstream",
      name: "Parent",
      url: "https://github.com/Upstream/Parent",
      repository: "Upstream/Parent",
    };

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [snapshot],
    });

    expect(
      result.errors.some((error) =>
        error.includes("must NOT have additional properties"),
      ),
    ).toBe(true);
  });

  test("accepts optional contributor facts in a version two snapshot", async () => {
    const snapshot = structuredClone(validSnapshotV2);
    snapshot.contributors = {
      accounts: [
        { provider: "github", login: "Alice", type: "User" },
        { provider: "github", login: "Claude", type: "User" },
      ],
      refreshed_at: "2026-07-25T00:00:00.000Z",
      stale_since: null,
    };

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [snapshot],
    });

    expect(result.errors).toEqual([]);
  });

  test("accepts resumable merged-pull-request contributor facts", async () => {
    const snapshot = structuredClone(validSnapshotV2);
    snapshot.repository.fork = true;
    snapshot.contributors = {
      accounts: [{ provider: "github", login: "LeRobber", type: "User" }],
      method: "merged-pull-requests",
      baseline_completed_at: null,
      scan: {
        next_page: 3,
        cutoff_at: null,
        target_watermark: "2026-07-25T00:00:00.000Z",
      },
      refreshed_at: "2026-07-25T00:00:00.000Z",
      stale_since: null,
    };

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [snapshot],
    });

    expect(result.errors).toEqual([]);
  });

  test("rejects case-insensitive duplicate contributor usernames", async () => {
    const snapshot = structuredClone(validSnapshotV2);
    snapshot.contributors = {
      accounts: [
        { provider: "github", login: "Alice", type: "User" },
        { provider: "github", login: "alice", type: "User" },
      ],
      refreshed_at: "2026-07-25T00:00:00.000Z",
      stale_since: null,
    };

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [snapshot],
    });

    expect(result.errors).toContain(
      "github-1: duplicate contributor username alice",
    );
  });

  test("accepts provisional and degraded version two evidence states", async () => {
    const provisional = structuredClone(validSnapshotV2);
    provisional.repository.head_committed_at = null;
    provisional.activity.source_weeks = [];
    provisional.activity.provisional_weeks = Array.from(
      { length: 12 },
      (_, index) => index === 11,
    );
    provisional.activity.evidence_status = "provisional";
    provisional.activity.baseline_completed_at = null;

    const degraded = structuredClone(validSnapshotV2);
    degraded.activity.evidence_status = "degraded";
    degraded.activity.provisional_weeks = Array.from(
      { length: 12 },
      () => false,
    );
    degraded.activity.baseline_completed_at = null;

    const provisionalResult = await validateCatalog({
      records: [validRecord],
      snapshots: [provisional],
    });
    const degradedResult = await validateCatalog({
      records: [validRecord],
      snapshots: [degraded],
    });

    expect(provisionalResult.errors).toEqual([]);
    expect(degradedResult.errors).toEqual([]);
  });

  test("accepts a resumable activity scan with a separate evidence head", async () => {
    const pending = structuredClone(validSnapshotV2);
    pending.activity.evidence_status = "provisional";
    pending.activity.evidence_head_sha = "a".repeat(40);
    pending.activity.provisional_weeks = Array.from(
      { length: 12 },
      (_, index) => index === 11,
    );
    pending.activity.baseline_completed_at = null;
    pending.repository.head_sha = "f".repeat(40);
    pending.activity_scan = {
      head_sha: "f".repeat(40),
      cutoff_at: "2026-04-15T00:00:00.000Z",
      next_page: 2,
      next_index: 14,
      resolved_weeks: ["2026-07-20"],
      pending_commit: {
        sha: "e".repeat(40),
        committed_at: "2026-07-16T03:00:00.000Z",
        parent_count: 1,
        next_file_page: 4,
        source_path_seen: true,
        substantive_patch_seen: false,
        patch_incomplete: false,
      },
    };

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [pending],
    });

    expect(result.errors).toEqual([]);
  });

  test("rejects illegal evidence-state field combinations", async () => {
    const nullCompleteHead = structuredClone(validSnapshotV2);
    nullCompleteHead.repository.head_committed_at = null;
    const completeWithProvisional = structuredClone(validSnapshotV2);
    completeWithProvisional.activity.provisional_weeks = Array.from(
      { length: 12 },
      () => false,
    );
    completeWithProvisional.activity.baseline_completed_at = null;
    const provisionalWithBaseline = structuredClone(validSnapshotV2);
    provisionalWithBaseline.activity.evidence_status = "provisional";
    const completeWithScan = structuredClone(validSnapshotV2);
    completeWithScan.activity_scan = {
      head_sha: "f".repeat(40),
      cutoff_at: "2026-04-15T00:00:00.000Z",
      next_page: 1,
      next_index: 0,
      resolved_weeks: [],
    };

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [
        nullCompleteHead,
        completeWithProvisional,
        provisionalWithBaseline,
        completeWithScan,
      ],
    });

    expect(result.errors).toContain(
      "github-1: null head_committed_at is allowed only for provisional evidence",
    );
    expect(result.errors).toContain(
      "github-1: complete evidence cannot retain provisional_weeks",
    );
    expect(result.errors).toContain(
      "github-1: complete evidence requires baseline_completed_at",
    );
    expect(result.errors).toContain(
      "github-1: provisional evidence cannot have baseline_completed_at",
    );
    expect(result.errors).toContain(
      "github-1: activity scan requires provisional evidence",
    );
  });

  test("rejects duplicate, non-Monday, and unsorted source weeks", async () => {
    const snapshot = structuredClone(validSnapshotV2);
    snapshot.activity.source_weeks = [
      {
        week_start: "2026-07-06",
        latest_at: "2026-07-07T00:00:00.000Z",
        precision: "exact",
      },
      {
        week_start: "2026-07-07",
        latest_at: "2026-07-08T00:00:00.000Z",
        precision: "interval",
      },
      {
        week_start: "2026-07-06",
        latest_at: "2026-07-09T00:00:00.000Z",
        precision: "exact",
      },
    ];

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [snapshot],
    });

    expect(result.errors).toContain(
      "github-1: source week 2026-07-07 is not a Monday UTC",
    );
    expect(result.errors).toContain(
      "github-1: duplicate source week 2026-07-06",
    );
    expect(result.errors).toContain(
      "github-1: source_weeks must be sorted newest to oldest",
    );
  });

  test("rejects version one repository snapshots", async () => {
    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [
        {
          ...validSnapshotV2,
          schema_version: 1,
        },
      ],
    });

    expect(result.errors.join("\n")).toContain(
      "github-1: schema /schema_version must be equal to constant",
    );
  });
});
