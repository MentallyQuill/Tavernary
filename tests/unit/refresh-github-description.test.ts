import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test, vi } from "vitest";

import { runRefresh } from "../../scripts/catalog/refresh-github.mjs";

const record = {
  schema_version: 4,
  id: "fixture",
  source: {
    type: "github",
    repository: "Creator/Project",
    repository_id: 42,
  },
  refresh_policy: "automatic",
  enrichment_policy: "automatic",
};

const observedRepository = {
  id: 42,
  owner: "Creator",
  name: "Project",
  url: "https://github.com/Creator/Project",
  description: "A short GitHub repository description.",
  defaultBranch: "main",
  headSha: "a".repeat(40),
  headCommittedAt: "2026-07-23T12:00:00.000Z",
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  sizeKb: 10,
};

test("persists the observed description in a new schema-v2 snapshot", async () => {
  const result = await runRefresh({
    mode: "incremental",
    now: "2026-07-24T08:00:00.000Z",
    records: [record],
    snapshots: [],
    observe: vi.fn(async () => ({
      observations: [
        {
          projectId: record.id,
          repository: observedRepository,
          community: {
            stargazersCount: 1,
            forksCount: 2,
            subscribersCount: 3,
          },
          latestReleaseAt: null,
          coarseLicenseSpdxId: "MIT",
        },
      ],
      failures: [],
      usage: { requestCount: 1, pointCost: 2, remainingPoints: 4_998 },
    })),
    inspectDelta: vi.fn(),
    inspectGit: vi.fn(),
    write: false,
  });

  expect(result.snapshots[0].repository.description).toBe(
    observedRepository.description,
  );
});

test("schema-v2 permits an optional nullable repository description only", async () => {
  const schema = JSON.parse(
    await readFile(
      resolve("data/schemas/repository-snapshot.schema.json"),
      "utf8",
    ),
  );
  const repository = schema.properties.repository;

  expect(repository.required).not.toContain("description");
  expect(repository.properties.description).toEqual({
    anyOf: [{ type: "string" }, { type: "null" }],
  });
  expect(repository.properties).not.toHaveProperty("readme");
  expect(schema.properties).not.toHaveProperty("readme");
});
