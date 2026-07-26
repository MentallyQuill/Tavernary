import { expect, test, vi } from "vitest";

import {
  enrichRecord,
  mapWithConcurrency,
  runEnrichmentBatch,
  selectEnrichmentRecords,
} from "../../scripts/catalog/enrich-readmes.mjs";

const record = {
  id: "fixture",
  name: "Fixture",
  kind: "extension",
  metadata_status: "provisional",
  enrichment_policy: "automatic" as const,
  summary: "Generic intake details.",
  visibility: "published",
  frontends: ["sillytavern"],
  source: {
    type: "github",
    repository: "Creator/Project",
    repository_id: 42,
  },
};

const snapshot = {
  schema_version: 2,
  project_id: "fixture",
  source_health: "healthy",
  stale_since: null,
  repository: {
    id: 42,
    owner: "Creator",
    name: "Project",
    url: "https://github.com/Creator/Project",
    default_branch: "main",
    head_sha: "a".repeat(40),
    head_committed_at: "2026-07-23T12:00:00.000Z",
    description: "A short project description.",
    archived: false,
    created_at: "2026-01-01T00:00:00.000Z",
    size_kb: 10,
  },
};

const vocabularies = {
  primaryFunctions: [
    { id: "developer-infrastructure", label: "Developer" },
    { id: "uncategorized", label: "Uncategorized" },
  ],
  capabilities: [{ id: "automation", label: "Automation" }],
};

const providerMetadata = {
  requestedModel: "MiniMax-M3" as const,
  returnedModel: "MiniMax-M3",
  latencyMs: 10,
};

function recordFor(id: string) {
  return {
    ...record,
    id,
    name: id,
    source: {
      ...record.source,
      repository: `Creator/${id}`,
      repository_id: 42,
    },
  };
}

function snapshotFor(id: string) {
  return {
    ...snapshot,
    project_id: id,
    repository: {
      ...snapshot.repository,
      name: id,
      url: `https://github.com/Creator/${id}`,
      description: `Description for ${id}.`,
    },
  };
}

function readySource(id: string) {
  return {
    status: "ready" as const,
    sourceKind: "description" as const,
    text: `Description for ${id}.`,
    repositoryDescription: `Description for ${id}.`,
    readmeText: null,
    readmePath: null,
    readmeRef: null,
    repositoryId: 42,
    headSha: "a".repeat(40),
  };
}

test("passes both source fields and only allowed vocabulary entries to provider", async () => {
  const generate = vi.fn(async (input) => ({
    output: {
      summary:
        "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
      metadata_status: "curated" as const,
      primary_function: input.allowedPrimaryFunctions[0].id,
      capabilities: [input.allowedCapabilities[0].id],
    },
    metadata: providerMetadata,
  }));

  const output = await enrichRecord(
    record,
    snapshot,
    { generate },
    {
      vocabularies,
      loadSource: async () => ({
        status: "ready" as const,
        sourceKind: "description" as const,
        text: "A short project description.",
        repositoryDescription: "A short project description.",
        readmeText: null,
        readmePath: null,
        readmeRef: null,
        repositoryId: 42,
        headSha: "a".repeat(40),
      }),
    },
  );

  expect(output).not.toBeNull();
  if (!output) return;
  expect(output.metadata_status).toBe("curated");
  expect(output.primary_function).toBe("developer-infrastructure");
  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({
      repositoryDescription: "A short project description.",
      readmeText: null,
      allowedPrimaryFunctions: [
        { id: "developer-infrastructure", label: "Developer" },
      ],
      allowedCapabilities: vocabularies.capabilities,
    }),
  );
});

test("skips curated records unless forced", async () => {
  const generate = vi.fn();
  const output = await enrichRecord(
    { ...record, metadata_status: "curated" },
    snapshot,
    { generate },
    { vocabularies },
  );

  expect(output).toBeNull();
  expect(generate).not.toHaveBeenCalled();
});

test("includes an automatic GitHub preset and excludes manual GitHub records even when forced", () => {
  const automaticPreset = {
    ...record,
    id: "preset",
    kind: "preset",
    enrichment_policy: "automatic" as const,
  };
  const manual = {
    ...record,
    id: "manual",
    metadata_status: "curated",
    enrichment_policy: "manual" as const,
    enrichment_note: "Bundled repository requires manual curation.",
  };

  expect(
    selectEnrichmentRecords([manual, automaticPreset], { force: true }).map(
      ({ id }) => id,
    ),
  ).toEqual(["preset"]);
});

test("does not call the provider for a manual record", async () => {
  const generate = vi.fn();
  await expect(
    enrichRecord(
      {
        ...record,
        enrichment_policy: "manual",
        enrichment_note: "Requires manual curation.",
      },
      snapshot,
      { generate },
      { force: true, vocabularies },
    ),
  ).resolves.toBeNull();
  expect(generate).not.toHaveBeenCalled();
});

test("reports an explicitly targeted manual record as skipped", async () => {
  const result = await runEnrichmentBatch({
    projectIds: ["manual"],
    recordsById: {
      manual: {
        ...record,
        id: "manual",
        enrichment_policy: "manual",
        enrichment_note: "Requires manual curation.",
      },
    },
    snapshotsById: {},
    phase: "primary",
    vocabularies,
    provider: { generate: vi.fn() },
    validateSnapshot: () => true,
  });

  expect(result).toEqual([
    {
      id: "manual",
      phase: "primary",
      outcome: "skipped",
      reasonCode: "manual-enrichment-policy",
      enrichmentNote: "Requires manual curation.",
      message: "Registry record requires manual enrichment.",
    },
  ]);
});

test("uses the exact fallback when both source texts are unavailable", async () => {
  const output = await enrichRecord(
    record,
    { ...snapshot, repository: { ...snapshot.repository, description: null } },
    { generate: vi.fn() },
    {
      vocabularies,
      loadSource: async () => ({
        status: "fallback" as const,
        sourceKind: "confirmed-fallback" as const,
        readmePath: null,
        readmeRef: "a".repeat(40),
        repositoryId: 42,
        headSha: "a".repeat(40),
      }),
    },
  );

  expect(output).toEqual({
    summary: "No README file found.",
    metadata_status: "curated",
    primary_function: "uncategorized",
    capabilities: [],
  });
});

test.each(["source-not-ready", "failed"] as const)(
  "does not convert %s source outcomes into curated fallback",
  async (status) => {
    await expect(
      enrichRecord(
        record,
        snapshot,
        { generate: vi.fn() },
        {
          vocabularies,
          loadSource: async () => ({
            status,
            reasonCode:
              status === "failed" ? "readme-server-error" : "unhealthy-source",
            message: "Source cannot be used.",
          }),
        },
      ),
    ).rejects.toThrow("Source cannot be used.");
  },
);

test("force regenerates curated records and provider failures propagate", async () => {
  const generate = vi.fn().mockRejectedValue(new Error("provider offline"));
  await expect(
    enrichRecord(
      { ...record, metadata_status: "curated" },
      snapshot,
      { generate },
      { vocabularies, force: true },
    ),
  ).rejects.toThrow("provider offline");
});

test("skips unpublished GitHub records", async () => {
  const generate = vi.fn();
  const output = await enrichRecord(
    { ...record, visibility: "quarantined" },
    snapshot,
    { generate },
    { vocabularies },
  );

  expect(output).toBeNull();
  expect(generate).not.toHaveBeenCalled();
});

test("rejects uncategorized output when source text exists", async () => {
  await expect(
    enrichRecord(
      record,
      snapshot,
      {
        generate: async () => ({
          output: {
            summary:
              "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
            metadata_status: "curated",
            primary_function: "uncategorized",
            capabilities: [],
          },
          metadata: providerMetadata,
        }),
      },
      { vocabularies },
    ),
  ).rejects.toThrow("substantive primary function");
});

test("returns ordered isolated outcomes for a mixed batch", async () => {
  const projectIds = ["description", "fallback", "stale", "offline"];
  const recordsById = Object.fromEntries(
    projectIds.map((id) => [id, recordFor(id)]),
  );
  const snapshotsById = Object.fromEntries(
    projectIds.map((id) => [id, snapshotFor(id)]),
  );
  const writeRecord = vi.fn(async () => {});
  const generate = vi.fn(async (input) => {
    if (input.id === "offline") throw new Error("provider offline");
    return {
      output: {
        summary:
          "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
        metadata_status: "curated" as const,
        primary_function: "developer-infrastructure",
        capabilities: ["automation"],
      },
      metadata: providerMetadata,
    };
  });
  const result = await runEnrichmentBatch({
    projectIds,
    recordsById,
    snapshotsById,
    phase: "primary",
    vocabularies,
    provider: { generate },
    validateSnapshot: () => true,
    loadSource: async (candidate) => {
      if (candidate.id === "fallback") {
        return {
          status: "fallback" as const,
          sourceKind: "confirmed-fallback" as const,
          readmePath: null,
          readmeRef: "a".repeat(40),
          repositoryId: 42,
          headSha: "a".repeat(40),
        };
      }
      if (candidate.id === "stale") {
        return {
          status: "source-not-ready" as const,
          reasonCode: "stale-source" as const,
          message: "Repository snapshot is stale.",
        };
      }
      return readySource(candidate.id);
    },
    writeRecord,
  });

  expect(result.map(({ id, outcome }) => ({ id, outcome }))).toEqual([
    { id: "description", outcome: "enriched" },
    { id: "fallback", outcome: "fallback" },
    { id: "stale", outcome: "source-not-ready" },
    { id: "offline", outcome: "failed" },
  ]);
  expect(writeRecord).toHaveBeenCalledTimes(2);
  expect(result[0]).toMatchObject({
    sourceKind: "description",
    provider: providerMetadata,
  });
  expect(result[1]).toMatchObject({
    sourceKind: "confirmed-fallback",
    readmeRef: "a".repeat(40),
  });
  for (const [input] of generate.mock.calls) {
    expect(input.allowedPrimaryFunctions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "uncategorized" }),
      ]),
    );
  }
});

test("runs no more than four model calls concurrently and preserves order", async () => {
  const projectIds = Array.from(
    { length: 12 },
    (_, index) => `project-${index}`,
  );
  const recordsById = Object.fromEntries(
    projectIds.map((id) => [id, recordFor(id)]),
  );
  const snapshotsById = Object.fromEntries(
    projectIds.map((id) => [id, snapshotFor(id)]),
  );
  let active = 0;
  let maximum = 0;
  const result = await runEnrichmentBatch({
    projectIds,
    recordsById,
    snapshotsById,
    phase: "primary",
    vocabularies,
    provider: {
      generate: vi.fn(async (input) => {
        active += 1;
        maximum = Math.max(maximum, active);
        const index = Number(input.id.split("-").at(-1));
        await new Promise((resolve) => setTimeout(resolve, (12 - index) % 5));
        active -= 1;
        return {
          output: {
            summary:
              "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
            metadata_status: "curated" as const,
            primary_function: "developer-infrastructure",
            capabilities: ["automation"],
          },
          metadata: providerMetadata,
        };
      }),
    },
    validateSnapshot: () => true,
    loadSource: async (candidate) => readySource(candidate.id),
    concurrency: 4,
    writeRecord: vi.fn(async () => {}),
  });

  expect(maximum).toBe(4);
  expect(result.map(({ id }) => id)).toEqual(projectIds);
});

test("validates worker-pool concurrency limits", async () => {
  await expect(
    mapWithConcurrency([1], 0, async (value) => value),
  ).rejects.toThrow("between 1 and 8");
  await expect(
    mapWithConcurrency([1], 9, async (value) => value),
  ).rejects.toThrow("between 1 and 8");
});
