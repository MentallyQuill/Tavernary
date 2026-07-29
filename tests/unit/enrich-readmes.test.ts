import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import {
  enrichRecord,
  mapWithConcurrency,
  runEnrichmentBatch,
  selectEnrichmentRecords,
  writeEnrichedRecord,
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
  primaryFunctions: [{ id: "developer-infrastructure", label: "Developer" }],
  capabilities: [{ id: "automation", label: "Automation" }],
};

const providerMetadata = {
  requestedModel: "MiniMax-M3" as const,
  returnedModel: "MiniMax-M3",
  latencyMs: 10,
};
const copyMetadata = {
  result: "accepted-unchanged" as const,
  change_reasons: [] as [],
  policy_signal: "none" as const,
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
    sourceIdentity: `github:creator/${id}`,
    text: `Description for ${id}.`,
    repositoryDescription: `Description for ${id}.`,
    readmeText: null,
    readmePath: null,
    readmeRef: null,
    repositoryId: 42,
    headSha: "a".repeat(40),
  };
}

test("passes normalized source and only allowed vocabulary entries to provider", async () => {
  const generate = vi.fn(async (input) => ({
    output: {
      summary:
        "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
      metadata_status: "curated" as const,
      capabilities: [input.allowedCapabilities[0].id],
      classification_review: null,
      result: "accepted-unchanged" as const,
      change_reasons: [],
      policy_signal: "none" as const,
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
        sourceIdentity: "github:creator/project",
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
  expect(output.classification_review).toBeNull();
  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({
      source: {
        kind: "description",
        identity: "github:creator/project",
        text: "A short project description.",
      },
      summaryMode: "synthesize",
      submittedDescription: "Generic intake details.",
      evidence: {
        readme: null,
        repositoryDescription: "A short project description.",
        submissionDescription: "Generic intake details.",
      },
      protectedTerms: ["Fixture", "Creator", "Project"],
      policyVersion: "2026-07-29",
      allowedCapabilities: vocabularies.capabilities,
    }),
  );
  expect(generate.mock.calls[0][0]).not.toHaveProperty(
    "allowedPrimaryFunctions",
  );
  expect(generate.mock.calls[0][0]).not.toHaveProperty(
    "classificationReviewRequest",
  );
});

test("selects an automatic published Reddit record without a repository snapshot", () => {
  const reddit = {
    ...record,
    id: "reddit-1v64r6z",
    kind: "preset",
    refresh_policy: "paused",
    source: {
      type: "url",
      url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update/",
    },
  };

  expect(selectEnrichmentRecords([reddit]).map(({ id }) => id)).toEqual([
    "reddit-1v64r6z",
  ]);
});

test("enriches a Reddit source without a repository snapshot", async () => {
  const reddit = {
    ...record,
    id: "reddit-1v64r6z",
    name: "Writer's Block 5",
    kind: "preset",
    refresh_policy: "paused",
    source: {
      type: "url",
      url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update/",
    },
  };
  const generate = vi.fn(async () => ({
    output: {
      summary:
        "Writer's Block supports deliberate narrative direction in roleplay sessions. It strengthens prose, subtext, character agency, and structured scene control across diverse compatible SillyTavern models.",
      metadata_status: "curated" as const,
      capabilities: ["automation"],
      classification_review: null,
      ...copyMetadata,
    },
    metadata: providerMetadata,
  }));

  const result = await runEnrichmentBatch({
    projectIds: [reddit.id],
    recordsById: { [reddit.id]: reddit },
    snapshotsById: {},
    phase: "primary",
    vocabularies,
    provider: { generate },
    validateSnapshot: () => true,
    loadSource: async () => ({
      status: "ready" as const,
      sourceKind: "reddit-body" as const,
      sourceIdentity: "reddit:1v64r6z",
      redditPostId: "1v64r6z",
      text: "Writer's Block 5 post body.",
    }),
    writeRecord: async () => {},
  });

  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({
      source: {
        kind: "reddit-body",
        identity: "reddit:1v64r6z",
        text: "Writer's Block 5 post body.",
      },
    }),
  );
  expect(result[0]).toMatchObject({
    outcome: "enriched",
    sourceKind: "reddit-body",
    sourceIdentity: "reddit:1v64r6z",
    redditPostId: "1v64r6z",
  });
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

test("preserves an owner edit made after automatic enrichment selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-owner-edit-"));
  const path = join(root, "fixture.json");
  const selected = selectEnrichmentRecords([record]);
  expect(selected.map(({ id }) => id)).toEqual(["fixture"]);

  const ownerEdited = {
    ...record,
    summary: "Owner-authored summary.",
    metadata_status: "curated",
    enrichment_policy: "manual" as const,
    enrichment_note:
      "Owner-authored catalog details approved through issue #123.",
  };
  await writeFile(path, JSON.stringify(ownerEdited, null, 2));

  const results = await runEnrichmentBatch({
    projectIds: selected.map(({ id }) => id),
    recordsById: {
      fixture: { ...selected[0], path },
    },
    snapshotsById: { fixture: snapshot },
    phase: "primary",
    vocabularies,
    provider: {
      generate: async () => ({
        output: {
          summary:
            "Generated summary would replace the approved owner wording if the writer trusted selection-time state. The write barrier must re-read current policy before changing the registry record.",
          metadata_status: "curated",
          capabilities: ["automation"],
          classification_review: null,
          ...copyMetadata,
        },
        metadata: providerMetadata,
      }),
    },
    validateSnapshot: () => true,
    loadSource: async () => readySource("fixture"),
  });

  expect(results).toMatchObject([
    {
      id: "fixture",
      outcome: "skipped",
      reasonCode: "manual-enrichment-policy",
      enrichmentNote:
        "Owner-authored catalog details approved through issue #123.",
    },
  ]);
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual(ownerEdited);
});

test("writes the accepted summary without persisting copy-audit metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-copy-audit-"));
  const path = join(root, "fixture.json");
  await writeFile(path, JSON.stringify(record, null, 2));

  await writeEnrichedRecord(path, record, {
    summary:
      "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator controls, and keeps complex configuration work clear and accessible to users throughout.",
    metadata_status: "curated",
    capabilities: ["automation"],
    classification_review: null,
    result: "accepted-with-light-edits",
    change_reasons: ["punctuation-corrected"],
    policy_signal: "none",
  });

  const written = JSON.parse(await readFile(path, "utf8"));
  expect(written.summary).toContain("Fixture organizes");
  expect(written).not.toHaveProperty("result");
  expect(written).not.toHaveProperty("change_reasons");
  expect(written).not.toHaveProperty("policy_signal");
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
        sourceIdentity: "github:creator/project",
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
    capabilities: [],
    classification_review: null,
    ...copyMetadata,
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
      {
        vocabularies,
        force: true,
        loadSource: async () => readySource("fixture"),
      },
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

test("rejects a model-owned primary function when source text exists", async () => {
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
            primary_function: "developer-infrastructure",
            capabilities: [],
            classification_review: null,
            ...copyMetadata,
          },
          metadata: providerMetadata,
        }),
      },
      {
        vocabularies,
        loadSource: async () => readySource("fixture"),
      },
    ),
  ).rejects.toThrow("primary_function is not allowed");
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
        capabilities: ["automation"],
        classification_review: null,
        ...copyMetadata,
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
          sourceIdentity: "github:creator/fallback",
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
    expect(input).not.toHaveProperty("allowedPrimaryFunctions");
    expect(input).not.toHaveProperty("classificationReviewRequest");
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
            capabilities: ["automation"],
            classification_review: null,
            ...copyMetadata,
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

test("backs off new model work after repeated provider rate limits", async () => {
  const projectIds = ["rate-limit-1", "rate-limit-2", "healthy"];
  const sleep = vi.fn(async (_milliseconds: number) => {});
  const generate = vi.fn(async (input: { id: string }) => {
    if (input.id.startsWith("rate-limit")) {
      throw Object.assign(new Error("rate limited"), {
        code: "provider-rate-limited",
      });
    }
    return {
      output: {
        summary:
          "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
        metadata_status: "curated" as const,
        capabilities: ["automation"],
        classification_review: null,
        ...copyMetadata,
      },
      metadata: providerMetadata,
    };
  });

  const results = await runEnrichmentBatch({
    projectIds,
    recordsById: Object.fromEntries(
      projectIds.map((id) => [id, recordFor(id)]),
    ),
    snapshotsById: Object.fromEntries(
      projectIds.map((id) => [id, snapshotFor(id)]),
    ),
    phase: "primary",
    vocabularies,
    provider: { generate },
    validateSnapshot: () => true,
    loadSource: async (candidate) => readySource(candidate.id),
    concurrency: 1,
    sleep,
    writeRecord: vi.fn(async () => {}),
  });

  expect(results.map(({ reasonCode }) => reasonCode)).toEqual([
    "provider-rate-limited",
    "provider-rate-limited",
    undefined,
  ]);
  expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
    5_000, 15_000,
  ]);
});
