import { expect, test } from "vitest";

import { planRepositoryIdentityBackfill } from "../../scripts/catalog/backfill-repository-identities.mjs";
import { backfillRepositoryIdentities } from "../../scripts/catalog/repository-identity-backfill.mjs";

test("backfills only null IDs from healthy matching snapshots", () => {
  const records = [
    {
      id: "pending",
      source: {
        type: "github",
        repository: "Example/Pending",
        repository_id: null,
      },
    },
    {
      id: "curated",
      source: {
        type: "github",
        repository: "Example/Curated",
        repository_id: 7,
      },
    },
  ];
  const snapshots = [
    {
      project_id: "pending",
      source_health: "healthy",
      repository: {
        id: 42,
        owner: "Example",
        name: "Pending",
      },
    },
    {
      project_id: "curated",
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
      source: expect.objectContaining({ repository_id: 42 }),
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
      source: {
        type: "github",
        repository: "Example/Updated",
        repository_id: null,
      },
    },
    {
      id: "unhealthy",
      source: {
        type: "github",
        repository: "Example/Unhealthy",
        repository_id: null,
      },
    },
    {
      id: "mismatch",
      source: {
        type: "github",
        repository: "Example/Expected",
        repository_id: null,
      },
    },
    {
      id: "manual",
      source: {
        type: "url",
        url: "https://example.com",
      },
    },
  ];
  const snapshots = [
    {
      project_id: "updated",
      source_health: "healthy",
      repository: {
        id: 42,
        owner: "Example",
        name: "Updated",
      },
    },
    {
      project_id: "unhealthy",
      source_health: "unavailable",
      repository: {
        id: 77,
        owner: "Example",
        name: "Unhealthy",
      },
    },
    {
      project_id: "mismatch",
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
      source: {
        type: "github",
        repository: "Example/Stable",
        repository_id: 42,
      },
    },
  ];
  const snapshots = [
    {
      project_id: "stable",
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
      source: {
        type: "github",
        repository: "Example/Pending",
        repository_id: null,
      },
    },
  ];
  const snapshots = [
    {
      project_id: "pending",
      source_health: "healthy",
      repository: {
        id: 42,
        owner: "Example",
        name: "Pending",
      },
    },
  ];

  const validateCatalog = async ({ records: projectedRecords }) => ({
    projectCount: projectedRecords.length,
    snapshotCount: snapshots.length,
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
  expect(result.projectedRecords).toEqual([
    expect.objectContaining({
      id: "pending",
      source: expect.objectContaining({ repository_id: 42 }),
    }),
  ]);
});
