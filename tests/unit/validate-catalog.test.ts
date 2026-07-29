import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { validateCatalog } from "../../scripts/catalog/validate.mjs";

const validRecord = {
  schema_version: 5,
  id: "valid-preset",
  name: "Valid Preset",
  kind: "preset",
  summary: "A valid test fixture.",
  metadata_status: "curated",
  source: {
    type: "github",
    repository: "example/valid-preset",
    repository_id: 1,
  },
  frontends: ["sillytavern"],
  primary_function: "preset",
  capabilities: ["prompt-engineering"],
  model_families: ["claude"],
  completion_formats: ["chat-completion"],
  cataloged_at: "2026-07-23T00:00:00Z",
  catalog_cohort: "seed",
  visibility: "published",
  visibility_reason: null,
  refresh_policy: "automatic",
  enrichment_policy: "automatic",
};

const validSnapshotV2: Record<string, any> = {
  schema_version: 3,
  provider: "github",
  project_id: "valid-preset",
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

describe("catalog validation", () => {
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
      kind: "extension",
      primary_function: "interface-workflow",
      source: {
        type: "codeberg",
        repository: "targren/Lumiverse-SwipeScrubber",
        repository_id: 1699613,
      },
    };
    const snapshot = {
      ...validSnapshotV2,
      provider: "codeberg",
      project_id: record.id,
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
    const codebergRecord = {
      ...validRecord,
      source: {
        type: "codeberg",
        repository: "example/valid-preset",
        repository_id: 1,
      },
    };
    const result = await validateCatalog({
      records: [codebergRecord],
      snapshots: [validSnapshotV2, { ...validSnapshotV2 }],
    });

    expect(result.errors).toContain(
      "valid-preset: snapshot provider does not match record source",
    );
    expect(result.errors).toContain(
      "valid-preset: duplicate repository snapshot",
    );
  });

  test("requires an explicit enrichment policy", async () => {
    const { enrichment_policy: _removed, ...record } = validRecord;
    const result = await validateCatalog({ records: [record] });

    expect(result.errors.join("\n")).toContain("enrichment_policy");
  });

  test("requires a note only for manual enrichment", async () => {
    const missingNote = await validateCatalog({
      records: [{ ...validRecord, enrichment_policy: "manual" }],
    });
    expect(missingNote.errors.join("\n")).toContain("enrichment_note");

    const automaticWithNote = await validateCatalog({
      records: [
        {
          ...validRecord,
          enrichment_policy: "automatic",
          enrichment_note: "This note must not be retained.",
        },
      ],
    });
    expect(automaticWithNote.errors.join("\n")).toContain("must NOT be valid");
  });

  test("requires unsupported external sources to remain manual", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          source: {
            type: "url",
            url: "https://example.com/preset",
            published_at: null,
            version: null,
            artifact_size_bytes: null,
            license_status: "missing",
            license_spdx_id: null,
          },
          refresh_policy: "paused",
          enrichment_policy: "automatic",
        },
      ],
    });

    expect(result.errors).toContain(
      "valid-preset: automatic enrichment requires a supported source adapter",
    );
  });

  test("allows a documented manual GitHub exception", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          enrichment_policy: "manual",
          enrichment_note: "Bundled repository requires manual curation.",
        },
      ],
    });

    expect(result.errors).toEqual([]);
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
    const result = await validateCatalog({
      records: [
        {
          schema_version: 5,
          id: "bad-extension",
          name: "Bad Extension",
          kind: "extension",
          summary: "Invalid source fixture.",
          metadata_status: "curated",
          source: { type: "url", url: "https://example.com/tool" },
          frontends: ["sillytavern"],
          primary_function: "generation-reasoning",
          capabilities: [],
          cataloged_at: "2026-07-23T00:00:00Z",
          catalog_cohort: "seed",
          visibility: "published",
          visibility_reason: null,
          refresh_policy: "automatic",
          enrichment_policy: "manual",
          enrichment_note: "External URL source; requires manual curation.",
        },
      ],
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
          name: "Codeberg Frontend",
          kind: "frontend",
          source: {
            type: "url",
            url: "https://codeberg.org/example/frontend",
            published_at: null,
            version: null,
            artifact_size_bytes: null,
            license_status: "missing",
            license_spdx_id: null,
          },
          primary_function: "frontend",
          refresh_policy: "paused",
          enrichment_policy: "manual",
          enrichment_note: "External URL source; requires manual curation.",
        },
      ],
      snapshots: [],
    });

    expect(result.errors).toEqual([]);
  });

  test("rejects duplicate identities and canonical sources", async () => {
    const result = await validateCatalog({
      records: [
        validRecord,
        {
          ...validRecord,
          source: {
            ...validRecord.source,
            repository: "EXAMPLE/VALID-PRESET",
          },
        },
      ],
    });

    expect(result.errors).toContain("valid-preset: duplicate project id");
    expect(result.errors).toContain("valid-preset: duplicate canonical source");
  });

  test("rejects duplicate permanent GitHub repository IDs", async () => {
    const result = await validateCatalog({
      records: [
        validRecord,
        {
          ...validRecord,
          id: "second-preset",
          name: "Second Preset",
          source: {
            ...validRecord.source,
            repository: "example/second-preset",
          },
        },
      ],
    });

    expect(result.errors).toContain(
      "second-preset: duplicate GitHub repository_id 1",
    );
  });

  test("rejects unknown vocabulary values and missing GitHub identity", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "bad-vocabulary",
          source: {
            type: "github",
            repository: "example/bad-vocabulary",
            repository_id: 0,
          },
          frontends: ["unknown-frontend"],
          primary_function: "unknown-function",
          capabilities: ["unknown-capability"],
        },
      ],
    });

    expect(result.errors).toContain(
      "bad-vocabulary: curated GitHub source requires permanent repository_id",
    );
    expect(result.errors).toContain(
      "bad-vocabulary: unknown frontend unknown-frontend",
    );
    expect(result.errors).toContain(
      "bad-vocabulary: unknown primary function unknown-function",
    );
    expect(result.errors).toContain(
      "bad-vocabulary: unknown capability unknown-capability",
    );
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

  test("accepts provisional GitHub null identity with a structural Preset classification", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "provisional-github",
          metadata_status: "provisional",
          primary_function: "preset",
          source: {
            type: "github",
            repository: "example/provisional-github",
            repository_id: null,
          },
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.snapshotCount).toBe(0);
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

  test("rejects curated GitHub null identity", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          source: {
            type: "github",
            repository: "example/valid-preset",
            repository_id: null,
          },
        },
      ],
    });

    expect(result.errors).toContain(
      "valid-preset: curated GitHub source requires permanent repository_id",
    );
  });

  test("accepts curated metadata for the paused Tavern RPG Suite organization", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "tavern-rpg-suite",
          name: "Tavern RPG Suite",
          kind: "extension",
          summary:
            "A SillyTavern extension suite adding maps, inventory, vitals, equipment, memory, minigames, and secondary-model roleplay tools.",
          metadata_status: "curated",
          primary_function: "rpg-systems",
          capabilities: [
            "automation",
            "character-worldbuilding",
            "image-generation",
            "instruction-control",
            "model-routing",
          ],
          model_families: undefined,
          completion_formats: undefined,
          refresh_policy: "paused",
          enrichment_policy: "manual",
          enrichment_note: "Multi-repository suite; requires manual curation.",
          source: {
            type: "github-organization",
            organization: "tavern-rpg-suite",
            url: "https://github.com/tavern-rpg-suite",
          },
        },
      ],
      snapshots: [],
    });

    expect(result.errors).toEqual([]);
  });

  test("requires the Tavern RPG Suite organization to remain paused", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "tavern-rpg-suite",
          name: "Tavern RPG Suite",
          kind: "extension",
          metadata_status: "curated",
          primary_function: "rpg-systems",
          capabilities: ["automation"],
          refresh_policy: "automatic",
          enrichment_policy: "manual",
          enrichment_note: "Multi-repository suite; requires manual curation.",
          source: {
            type: "github-organization",
            organization: "tavern-rpg-suite",
            url: "https://github.com/tavern-rpg-suite",
          },
        },
      ],
      snapshots: [],
    });

    expect(result.errors).toContain(
      "tavern-rpg-suite: github-organization requires paused extension with manual enrichment policy",
    );
  });

  test("rejects the reserved organization when the exact pair does not match", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "tavern-rpg-suite",
          name: "Tavern RPG Suite",
          kind: "extension",
          metadata_status: "provisional",
          primary_function: "rpg-systems",
          refresh_policy: "paused",
          enrichment_policy: "manual",
          enrichment_note: "Multi-repository suite; requires manual curation.",
          source: {
            type: "github-organization",
            organization: "tavern-rpg-suite",
            url: "https://github.com/tavern-rpg-suite-wrong",
          },
        },
      ],
      snapshots: [],
    });

    expect(result.errors).toContain(
      "tavern-rpg-suite: github-organization url must be https://github.com/tavern-rpg-suite",
    );
  });

  test("rejects other github organizations", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "another-organization",
          name: "Another Organization",
          kind: "extension",
          metadata_status: "provisional",
          primary_function: "rpg-systems",
          refresh_policy: "paused",
          enrichment_policy: "manual",
          enrichment_note: "Multi-repository suite; requires manual curation.",
          source: {
            type: "github-organization",
            organization: "someone-else",
            url: "https://github.com/someone-else",
          },
        },
      ],
      snapshots: [],
    });

    expect(result.errors).toContain(
      "another-organization: github-organization is reserved for tavern-rpg-suite",
    );
  });

  test("requires URL sources to use https", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "unsafe-url",
          source: {
            type: "url",
            url: "http://example.com/preset",
            published_at: null,
            version: null,
            artifact_size_bytes: null,
            license_status: "missing",
            license_spdx_id: null,
          },
        },
      ],
    });

    expect(result.errors).toContain(
      "unsafe-url: URL source requires https protocol",
    );
  });

  test("allows automatic enrichment for a canonical Reddit post", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "reddit-preset",
          refresh_policy: "paused",
          source: {
            type: "url",
            url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update/",
            published_at: null,
            version: null,
            artifact_size_bytes: null,
            license_status: "pending",
            license_spdx_id: null,
          },
        },
      ],
      snapshots: [],
    });

    expect(result.errors).toEqual([]);
  });

  test("rejects automatic enrichment for an unsupported external URL", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "external-preset",
          refresh_policy: "paused",
          source: {
            type: "url",
            url: "https://example.com/preset",
            published_at: null,
            version: null,
            artifact_size_bytes: null,
            license_status: "pending",
            license_spdx_id: null,
          },
        },
      ],
      snapshots: [],
    });

    expect(result.errors).toContain(
      "external-preset: automatic enrichment requires a supported source adapter",
    );
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
      "valid-preset: repository cannot be its own fork parent",
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
      "valid-preset: non-fork repository cannot have a fork parent",
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
      "valid-preset: duplicate contributor username alice",
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
      "valid-preset: null head_committed_at is allowed only for provisional evidence",
    );
    expect(result.errors).toContain(
      "valid-preset: complete evidence cannot retain provisional_weeks",
    );
    expect(result.errors).toContain(
      "valid-preset: complete evidence requires baseline_completed_at",
    );
    expect(result.errors).toContain(
      "valid-preset: provisional evidence cannot have baseline_completed_at",
    );
    expect(result.errors).toContain(
      "valid-preset: activity scan requires provisional evidence",
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
      "valid-preset: source week 2026-07-07 is not a Monday UTC",
    );
    expect(result.errors).toContain(
      "valid-preset: duplicate source week 2026-07-06",
    );
    expect(result.errors).toContain(
      "valid-preset: source_weeks must be sorted newest to oldest",
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
      "valid-preset: schema /schema_version must be equal to constant",
    );
  });
});
