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
  source: { type: "github", repository: "Creator/Project" },
};

const snapshot = {
  repository: {
    owner: "Creator",
    name: "Project",
    default_branch: "main",
    description: "A short project description.",
  },
  readme: { found: true, path: "README.md", ref: "main" },
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
        repositoryDescription: "A short project description.",
        readmeText: "# Project\n\nUseful README details.",
        readmePath: "README.md",
        readmeRef: "main",
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
      readmeText: "# Project\n\nUseful README details.",
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
        repositoryDescription: null,
        readmeText: null,
        readmePath: null,
        readmeRef: null,
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
