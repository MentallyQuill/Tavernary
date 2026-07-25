import { expect, test, vi } from "vitest";

import { enrichRecord } from "../../scripts/catalog/enrich-readmes.mjs";

const record = {
  id: "fixture",
  name: "Fixture",
  kind: "extension",
  metadata_status: "provisional",
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

test("passes both source fields and only allowed vocabulary entries to provider", async () => {
  const generate = vi.fn(async (input) => ({
    summary:
      "A focused extension for automating repeatable project workflows across SillyTavern projects and creators.",
    metadata_status: "curated" as const,
    primary_function: input.allowedPrimaryFunctions[0].id,
    capabilities: [input.allowedCapabilities[0].id],
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
      allowedPrimaryFunctions: vocabularies.primaryFunctions,
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
          summary:
            "A focused extension for automating repeatable project workflows across SillyTavern projects and creators.",
          metadata_status: "curated",
          primary_function: "uncategorized",
          capabilities: [],
        }),
      },
      { vocabularies },
    ),
  ).rejects.toThrow("substantive primary function");
});
