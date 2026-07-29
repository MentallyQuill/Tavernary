import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  parseIdentityBackfillArguments,
  planRepositoryIdentityBackfill,
  writeUpdatedRecords,
} from "../../scripts/catalog/backfill-repository-identities.mjs";
import { backfillRepositoryIdentities } from "../../scripts/catalog/repository-identity-backfill.mjs";
import type { IdentitySourceRecord } from "../../scripts/catalog/repository-identity-backfill.mjs";

test("backfills only null IDs from healthy matching snapshots", () => {
  const records = [
    {
      id: "pending",
      type: "github",
      repository: "Example/Pending",
      repository_id: null,
    },
    {
      id: "curated",
      type: "github",
      repository: "Example/Curated",
      repository_id: 7,
    },
  ];
  const snapshots = [
    {
      source_id: "pending",
      source_health: "healthy",
      repository: {
        id: 42,
        owner: "Example",
        name: "Pending",
      },
    },
    {
      source_id: "curated",
      source_health: "healthy",
      repository: {
        id: 99,
        owner: "Example",
        name: "Curated",
      },
    },
  ];

  const result = backfillRepositoryIdentities(records, snapshots);

  expect(result.updated).toEqual([
    expect.objectContaining({
      id: "pending",
      repository_id: 42,
    }),
  ]);
  expect(result.conflicts).toEqual([
    {
      id: "curated",
      reason: "repository-id-mismatch",
      expected: 7,
      received: 99,
    },
  ]);
});

test("reports deterministic changed skipped and conflict counts", () => {
  const records = [
    {
      id: "updated",
      type: "github",
      repository: "Example/Updated",
      repository_id: null,
    },
    {
      id: "unhealthy",
      type: "github",
      repository: "Example/Unhealthy",
      repository_id: null,
    },
    {
      id: "mismatch",
      type: "github",
      repository: "Example/Expected",
      repository_id: null,
    },
    {
      id: "manual",
      type: "url",
      url: "https://example.com",
    },
  ];
  const snapshots = [
    {
      source_id: "updated",
      source_health: "healthy",
      repository: {
        id: 42,
        owner: "Example",
        name: "Updated",
      },
    },
    {
      source_id: "unhealthy",
      source_health: "unavailable",
      repository: {
        id: 77,
        owner: "Example",
        name: "Unhealthy",
      },
    },
    {
      source_id: "mismatch",
      source_health: "healthy",
      repository: {
        id: 88,
        owner: "Other",
        name: "Repo",
      },
    },
  ];

  const result = backfillRepositoryIdentities(records, snapshots);

  expect(result.summary).toEqual({
    changed: 1,
    skipped: 2,
    conflicts: 1,
  });
});

test("counts healthy matching snapshots with matching non-null IDs in deterministic totals", () => {
  const records = [
    {
      id: "stable",
      type: "github",
      repository: "Example/Stable",
      repository_id: 42,
    },
  ];
  const snapshots = [
    {
      source_id: "stable",
      source_health: "healthy",
      repository: {
        id: 42,
        owner: "Example",
        name: "Stable",
      },
    },
  ];

  const result = backfillRepositoryIdentities(records, snapshots);

  expect(result.updated).toEqual([]);
  expect(result.conflicts).toEqual([]);
  expect(result.summary).toEqual({
    changed: 0,
    skipped: 1,
    conflicts: 0,
  });
});

test("plans a validated backfill projection before writing", async () => {
  const records = [
    {
      id: "pending",
      type: "github",
      repository: "Example/Pending",
      repository_id: null,
    },
  ];
  const snapshots = [
    {
      source_id: "pending",
      source_health: "healthy",
      repository: {
        id: 42,
        owner: "Example",
        name: "Pending",
      },
    },
  ];

  const validateCatalog = async ({
    sources: projectedSources,
  }: {
    sources: IdentitySourceRecord[];
  }) => ({
    projectCount: projectedSources.length,
    snapshotCount: snapshots.length,
    kitCount: 0,
    kitSnapshotCount: 0,
    errors: [],
  });

  const result = await planRepositoryIdentityBackfill({
    records,
    snapshots,
    validateCatalog,
  });

  expect(result.summary).toEqual({
    changed: 1,
    skipped: 0,
    conflicts: 0,
  });
  expect(result.projectedSources).toEqual([
    expect.objectContaining({
      id: "pending",
      repository_id: 42,
    }),
  ]);
});

test("targets only explicitly selected source IDs", () => {
  const records = ["canary-a", "canary-b", "other"].map((id) => ({
    id,
    type: "github",
    repository: `Example/${id}`,
    repository_id: null,
  }));
  const snapshots = records.map(({ id }, index) => ({
    source_id: id,
    source_health: "healthy",
    repository: {
      id: index + 1,
      owner: "Example",
      name: id,
    },
  }));

  const result = backfillRepositoryIdentities(records, snapshots, {
    sourceIds: new Set(["canary-a", "canary-b"]),
  });

  expect(result.updated.map(({ id }) => id)).toEqual(["canary-a", "canary-b"]);
  expect(result.updated).not.toContainEqual(
    expect.objectContaining({ id: "other" }),
  );
  expect(result.summary).toEqual({
    changed: 2,
    skipped: 1,
    conflicts: 0,
  });
});

test("parses repeated source IDs and rejects duplicates", () => {
  expect(
    parseIdentityBackfillArguments([
      "--write",
      "--source-id",
      "a",
      "--source-id",
      "b",
    ]),
  ).toEqual({
    write: true,
    sourceIds: new Set(["a", "b"]),
  });
  expect(() =>
    parseIdentityBackfillArguments(["--source-id", "a", "--source-id", "a"]),
  ).toThrow("duplicate");
});

test("rejects unknown targeted IDs before catalog validation", async () => {
  const validateCatalog = async () => {
    throw new Error("validation should not run");
  };

  await expect(
    planRepositoryIdentityBackfill({
      records: [
        {
          id: "known",
          type: "github",
          repository: "Example/Known",
          repository_id: null,
        },
      ],
      snapshots: [],
      sourceIds: new Set(["unknown"]),
      validateCatalog,
    }),
  ).rejects.toThrow("unknown source ID");
});

test("writes backfilled records in repository Prettier format", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tavernary-backfill-"));
  await writeUpdatedRecords(
    [
      {
        id: "formatted",
        type: "github",
        repository: "Example/Formatted",
        repository_id: 42,
        refresh_policy: "automatic",
      },
    ],
    directory,
  );

  const serialized = await readFile(join(directory, "formatted.json"), "utf8");
  expect(serialized).toContain('"repository": "Example/Formatted"');
  expect(serialized).toContain('"refresh_policy": "automatic"');
});
