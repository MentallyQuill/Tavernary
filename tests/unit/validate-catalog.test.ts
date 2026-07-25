import { describe, expect, test } from "vitest";

import { validateCatalog } from "../../scripts/catalog/validate.mjs";

const validRecord = {
  schema_version: 3,
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
  primary_function: "generation-reasoning",
  capabilities: ["prompt-engineering"],
  cataloged_at: "2026-07-23T00:00:00Z",
  catalog_cohort: "seed",
  visibility: "published",
  visibility_reason: null,
  refresh_policy: "automatic",
};

const validSnapshotV2: Record<string, any> = {
  schema_version: 2,
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
    stargazers_count: 3,
    forks_count: 2,
    subscribers_count: 1,
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
  test("accepts the 214-project launch catalog", async () => {
    const result = await validateCatalog();
    expect(result.errors).toEqual([]);
    expect(result.projectCount).toBe(214);
    expect(result.kitCount).toBe(0);
    expect(result.kitSnapshotCount).toBe(0);
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
          schema_version: 3,
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
        },
      ],
    });

    expect(result.errors).toContain(
      "bad-extension: extension requires a GitHub source",
    );
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

  test("accepts provisional GitHub null identity and uncategorized metadata", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "provisional-github",
          metadata_status: "provisional",
          primary_function: "uncategorized",
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

  test("accepts the paused provisional Tavern RPG Suite organization", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "tavern-rpg-suite",
          name: "Tavern RPG Suite",
          kind: "extension",
          metadata_status: "provisional",
          primary_function: "uncategorized",
          refresh_policy: "paused",
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

  test("rejects the reserved organization when the exact pair does not match", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "tavern-rpg-suite",
          name: "Tavern RPG Suite",
          kind: "extension",
          metadata_status: "provisional",
          primary_function: "uncategorized",
          refresh_policy: "paused",
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
          primary_function: "uncategorized",
          refresh_policy: "paused",
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

  test("allows URL sources only for presets and only over https", async () => {
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

  test("accepts complete version two activity evidence", async () => {
    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [validSnapshotV2],
    });

    expect(result.errors).toEqual([]);
    expect(result.snapshotCount).toBe(1);
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

    const result = await validateCatalog({
      records: [validRecord],
      snapshots: [
        nullCompleteHead,
        completeWithProvisional,
        provisionalWithBaseline,
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
