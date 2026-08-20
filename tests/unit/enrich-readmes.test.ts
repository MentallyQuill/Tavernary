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
import { EnrichmentProviderError } from "../../scripts/catalog/enrichment-provider.mjs";
import { tagVocabularyHash } from "../../scripts/catalog/tag-vocabulary.mjs";

const summary =
  "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.";

const record = {
  schema_version: 6,
  id: "fixture",
  name: "Fixture",
  kind: "extension",
  metadata_status: "provisional",
  summary: "Generic intake details.",
  tags: [],
  metadata_policy: {
    summary: { mode: "automatic" as const },
    tags: { mode: "automatic" as const },
  },
  listing_status: "active",
  frontends: ["sillytavern"],
  source_id: "github-fixture",
};

const sourceRecord = {
  id: "github-fixture",
  type: "github",
  repository: "Creator/Project",
  repository_id: 42,
};

const snapshot = {
  schema_version: 4,
  provider: "github",
  source_id: sourceRecord.id,
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
  schema_version: 1 as const,
  tags: [
    {
      id: "automate-roleplay-workflows",
      label: "Automate roleplay workflows",
      facet: "goal" as const,
      description: "Automates repeated roleplay setup or execution.",
      aliases: ["automation"],
      applicable_kinds: ["extension" as const],
      inclusion_guidance: ["The source describes repeatable automation."],
      exclusion_guidance: [],
    },
    {
      id: "configure-without-code",
      label: "Configure without code",
      facet: "trait" as const,
      description: "Provides a no-code configuration workflow.",
      aliases: [],
      applicable_kinds: ["extension" as const, "preset" as const],
      inclusion_guidance: ["The source describes visual configuration."],
      exclusion_guidance: [],
    },
  ],
};

const providerMetadata = {
  requestedModel: "MiniMax-M3" as const,
  returnedModel: "MiniMax-M3",
  latencyMs: 10,
};

type ProviderInput = {
  repair?: {
    reasonCode: string;
    message: string;
    rejectedSummary?: string;
  };
};

function outputFor(input: {
  requestedFields: readonly string[];
  allowedTags: Array<{ id: string }>;
}) {
  return {
    ...(input.requestedFields.includes("summary")
      ? {
          summary: { value: summary, evidence: ["readme:1-3"] },
          result: "accepted-unchanged" as const,
          change_reasons: [] as [],
          policy_signal: "none" as const,
        }
      : {}),
    ...(input.requestedFields.includes("tags")
      ? {
          tags: input.allowedTags.slice(0, 1).map(({ id }) => ({
            id,
            evidence: ["readme:4-8"],
          })),
        }
      : {}),
  };
}

function recordFor(id: string) {
  return { ...record, id, name: id, source_id: `github-${id}` };
}

function sourceFor(id: string) {
  return {
    ...sourceRecord,
    id: `github-${id}`,
    repository: `Creator/${id}`,
  };
}

function snapshotFor(id: string) {
  return {
    ...snapshot,
    source_id: `github-${id}`,
    repository: {
      ...snapshot.repository,
      name: id,
      url: `https://github.com/Creator/${id}`,
      description: `Description for ${id}.`,
    },
  };
}

function readySource(id = "project") {
  return {
    status: "ready" as const,
    sourceKind: "readme" as const,
    sourceIdentity: `github:creator/${id}`,
    text: `README evidence for ${id}.`,
    repositoryDescription: `Description for ${id}.`,
    readmeText: `README evidence for ${id}.`,
    readmePath: "README.md",
    readmeRef: "a".repeat(40),
    readmeIdentity: `github:creator/${id}@${"a".repeat(40)}:README.md`,
    repositoryId: 42,
    headSha: "a".repeat(40),
  };
}

test("passes requested fields, README-first evidence, and classifier vocabulary to the provider", async () => {
  const generate = vi.fn(async (input) => ({
    output: outputFor(input),
    metadata: providerMetadata,
  }));

  const output = await enrichRecord(
    record,
    sourceRecord,
    snapshot,
    { generate },
    {
      vocabularies,
      submittedDescription: "Unauthorized submitter prose.",
      loadSource: async () => readySource(),
    },
  );

  expect(output).toEqual(outputFor(generate.mock.calls[0][0]));
  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceId: record.source_id,
      requestedFields: ["summary", "tags"],
      vocabularyHash: tagVocabularyHash(vocabularies),
      evidence: {
        readme: {
          identity: readySource().readmeIdentity,
          text: readySource().readmeText,
        },
        repositoryDescription: readySource().repositoryDescription,
      },
      allowedTags: vocabularies.tags,
    }),
  );
  expect(generate.mock.calls[0][0].evidence).not.toHaveProperty(
    "submissionDescription",
  );
  expect(generate.mock.calls[0][0]).not.toHaveProperty("capabilities");
});

test("retries a transient provider timeout before validating submission copy", async () => {
  const sleep = vi.fn(async (_milliseconds: number) => undefined);
  const generate = vi
    .fn()
    .mockRejectedValueOnce(new EnrichmentProviderError("provider-timeout"))
    .mockImplementation(async (input) => ({
      output: outputFor(input),
      metadata: providerMetadata,
    }));

  const output = await enrichRecord(
    record,
    sourceRecord,
    snapshot,
    { generate },
    {
      vocabularies,
      loadSource: async () => readySource(),
      sleep,
    },
  );

  expect(output).toEqual(outputFor(generate.mock.calls[1][0]));
  expect(generate).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledWith(5_000);
});

test("keeps a manual summary while refreshing automatic tags", async () => {
  const manualSummary = {
    ...record,
    summary: "Owner-authored summary stays exactly as written.",
    metadata_policy: {
      summary: {
        mode: "manual" as const,
        note: "Verified repository owner selection.",
      },
      tags: { mode: "automatic" as const },
    },
  };
  const generate = vi.fn(async (input) => ({
    output: outputFor(input),
    metadata: providerMetadata,
  }));

  const output = await enrichRecord(
    manualSummary,
    sourceRecord,
    snapshot,
    { generate },
    {
      vocabularies,
      loadSource: async () => readySource(),
      maxProviderAttempts: 3,
    },
  );

  expect(generate.mock.calls[0][0].requestedFields).toEqual(["tags"]);
  expect(output).toEqual({
    tags: [
      {
        id: "automate-roleplay-workflows",
        evidence: ["readme:4-8"],
      },
    ],
  });
});

test("selects an automatic URL-backed record without a repository snapshot", () => {
  const reddit = {
    ...record,
    id: "reddit-1v64r6z",
    kind: "preset",
    source_id: "url-reddit-1v64r6z",
  };
  const redditSource = {
    id: reddit.source_id,
    type: "url",
    url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update/",
  };

  expect(
    selectEnrichmentRecords([reddit], {
      [redditSource.id]: redditSource,
    }).map(({ id }) => id),
  ).toEqual(["reddit-1v64r6z"]);
});

test("enriches a URL-backed source without a repository snapshot", async () => {
  const reddit = {
    ...record,
    id: "reddit-1v64r6z",
    name: "Writer's Block 5",
    kind: "preset",
    source_id: "url-reddit-1v64r6z",
  };
  const redditSource = {
    id: reddit.source_id,
    type: "url",
    url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update/",
  };
  const generate = vi.fn(async (input) => ({
    output: outputFor(input),
    metadata: providerMetadata,
  }));

  const result = await runEnrichmentBatch({
    projectIds: [reddit.id],
    recordsById: { [reddit.id]: reddit },
    sourcesById: { [redditSource.id]: redditSource },
    snapshotsBySourceId: {},
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
      requestedFields: ["summary", "tags"],
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

test("loads shared source evidence once while classifying sibling cards independently", async () => {
  const siblings = [
    { ...record, id: "suite-extension", name: "Suite Extension" },
    { ...record, id: "suite-preset", name: "Suite Preset", kind: "preset" },
  ];
  const loadSource = vi.fn(async () => readySource());
  const generate = vi.fn(async (input) => ({
    output: outputFor(input),
    metadata: providerMetadata,
  }));

  const results = await runEnrichmentBatch({
    projectIds: siblings.map(({ id }) => id),
    recordsById: Object.fromEntries(
      siblings.map((project) => [project.id, project]),
    ),
    sourcesById: { [sourceRecord.id]: sourceRecord },
    snapshotsBySourceId: { [sourceRecord.id]: snapshot },
    phase: "primary",
    vocabularies,
    provider: { generate },
    validateSnapshot: () => true,
    loadSource,
    writeRecord: vi.fn(async () => {}),
  });

  expect(loadSource).toHaveBeenCalledOnce();
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls.map(([input]) => input.id)).toEqual([
    "suite-extension",
    "suite-preset",
  ]);
  expect(results.map(({ outcome }) => outcome)).toEqual([
    "enriched",
    "enriched",
  ]);
});

test("skips records whose summary and tags are both manual", async () => {
  const manual = {
    ...record,
    metadata_policy: {
      summary: {
        mode: "manual" as const,
        note: "Verified repository owner selection.",
      },
      tags: {
        mode: "manual" as const,
        note: "Verified repository owner selection.",
      },
    },
  };
  const generate = vi.fn();

  await expect(
    enrichRecord(
      manual,
      sourceRecord,
      snapshot,
      { generate },
      {
        force: true,
        vocabularies,
      },
    ),
  ).resolves.toBeNull();
  expect(generate).not.toHaveBeenCalled();

  await expect(
    runEnrichmentBatch({
      projectIds: [manual.id],
      recordsById: { [manual.id]: manual },
      sourcesById: { [sourceRecord.id]: sourceRecord },
      snapshotsBySourceId: {},
      phase: "primary",
      vocabularies,
      provider: { generate },
      validateSnapshot: () => true,
    }),
  ).resolves.toEqual([
    {
      id: "fixture",
      phase: "primary",
      outcome: "skipped",
      reasonCode: "manual-enrichment-policy",
      enrichmentNote: "Summary and tags are manually managed.",
      message: "Registry record has no automatic metadata fields.",
    },
  ]);
});

test("selects pending automatic records and skips curated records unless forced", () => {
  const curated = {
    ...record,
    id: "curated",
    metadata_status: "curated",
    summary: "A complete editorial description.",
  };
  const manual = {
    ...record,
    id: "manual",
    metadata_policy: {
      summary: {
        mode: "manual" as const,
        note: "Verified repository owner selection.",
      },
      tags: {
        mode: "manual" as const,
        note: "Verified repository owner selection.",
      },
    },
  };
  expect(
    selectEnrichmentRecords([curated, manual, record], {
      [sourceRecord.id]: sourceRecord,
    }).map(({ id }) => id),
  ).toEqual(["fixture"]);
  expect(
    selectEnrichmentRecords(
      [curated, manual],
      { [sourceRecord.id]: sourceRecord },
      { force: true },
    ).map(({ id }) => id),
  ).toEqual(["curated"]);
});

test("the write barrier preserves a late manual summary and writes automatic tags", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-owner-edit-"));
  const path = join(root, "fixture.json");
  const current = {
    ...record,
    path,
    summary: "Owner-authored summary stays byte-for-byte.",
    metadata_policy: {
      summary: {
        mode: "manual" as const,
        note: "Verified repository owner selection.",
      },
      tags: { mode: "automatic" as const },
    },
  };
  await writeFile(path, JSON.stringify(current, null, 2));

  await writeEnrichedRecord(
    path,
    { ...record, path },
    {
      ...outputFor({
        requestedFields: ["summary", "tags"],
        allowedTags: vocabularies.tags,
      }),
    },
    vocabularies,
  );

  const written = JSON.parse(await readFile(path, "utf8"));
  expect(written.summary).toBe(current.summary);
  expect(written.tags).toEqual(["automate-roleplay-workflows"]);
  expect(written.metadata_policy).toEqual(current.metadata_policy);
  expect(written).not.toHaveProperty("result");
  expect(written).not.toHaveProperty("evidence");
});

test("uses an explicit empty-tag fallback when repository text is unavailable", async () => {
  const generate = vi.fn();
  const output = await enrichRecord(
    record,
    sourceRecord,
    snapshot,
    { generate },
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

  expect(generate).not.toHaveBeenCalled();
  expect(output).toEqual({
    summary: {
      value: "No README file found.",
      evidence: ["source:confirmed-fallback"],
    },
    tags: [],
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  });
});

test("uses the latest invalid output for a second validation repair", async () => {
  const initialSummary = `Initial rejected summary ${"initial ".repeat(28)}ends here.`;
  const firstRepairSummary = summary;
  const responses: ReturnType<typeof outputFor>[] = [
    {
      ...outputFor({
        requestedFields: ["summary", "tags"],
        allowedTags: vocabularies.tags,
      }),
      summary: {
        value: initialSummary,
        evidence: [`readme:${"initial-evidence".repeat(12)}`],
      },
    },
    {
      ...outputFor({
        requestedFields: ["summary", "tags"],
        allowedTags: vocabularies.tags,
      }),
      summary: {
        value: firstRepairSummary,
        evidence: ["readme:1-3"],
      },
      tags: [
        {
          id: "invented",
          evidence: ["readme:1-3"],
        },
      ],
    },
    outputFor({
      requestedFields: ["summary", "tags"],
      allowedTags: vocabularies.tags,
    }),
  ];
  const generate = vi.fn(async (_input: ProviderInput) => ({
    output: responses[generate.mock.calls.length - 1],
    metadata: providerMetadata,
  }));

  const output = await enrichRecord(
    record,
    sourceRecord,
    snapshot,
    { generate },
    {
      vocabularies,
      loadSource: async () => readySource(),
      maxProviderAttempts: 3,
    },
  );

  expect(output).toEqual(responses[2]);
  expect(generate).toHaveBeenCalledTimes(3);
  expect(generate.mock.calls[1]?.[0].repair).toMatchObject({
    reasonCode: "output-invalid",
    rejectedSummary: initialSummary,
  });
  expect(generate.mock.calls[1]?.[0].repair?.message).toContain(
    "Include compact source evidence references.",
  );
  expect(generate.mock.calls[2]?.[0].repair).toMatchObject({
    reasonCode: "output-invalid",
    rejectedSummary: firstRepairSummary,
  });
  expect(generate.mock.calls[2]?.[0].repair?.message).toContain(
    "Return zero to six unique allowed tag IDs with evidence.",
  );
  expect(generate.mock.calls[2]?.[0].repair?.message).not.toContain(
    "Include compact source evidence references.",
  );
});

test("tells intake synthesis to paraphrase bracketed source markers", async () => {
  const bracketedSummary =
    "Generates and preserves ComfyUI images from [[IMG: prompt | AR | SHOT | SEED]] markers in SillyTavern messages with configurable workflows and an image gallery.";
  const validOutput = outputFor({
    requestedFields: ["summary", "tags"],
    allowedTags: vocabularies.tags,
  });
  const invalidOutput = {
    ...validOutput,
    summary: {
      value: bracketedSummary,
      evidence: ["readme:1-4"],
    },
  };
  const generate = vi.fn(async (_input: ProviderInput) => ({
    output: generate.mock.calls.length === 1 ? invalidOutput : validOutput,
    metadata: providerMetadata,
  }));

  await enrichRecord(
    record,
    sourceRecord,
    snapshot,
    { generate },
    {
      vocabularies,
      loadSource: async () => readySource(),
      maxProviderAttempts: 2,
    },
  );

  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1]?.[0].repair).toMatchObject({
    reasonCode: "output-invalid",
    rejectedSummary: bracketedSummary,
  });
  expect(generate.mock.calls[1]?.[0].repair?.message).toContain(
    "Describe bracketed source syntax in ordinary words without reproducing square brackets.",
  );
});

test("restates structured field shapes when repairing primitive output", async () => {
  const validOutput = outputFor({
    requestedFields: ["summary", "tags"],
    allowedTags: vocabularies.tags,
  });
  const malformedOutput = {
    ...validOutput,
    summary,
    tags: ["interface-workflow"],
  } as unknown as ReturnType<typeof outputFor>;
  const generate = vi.fn(async (_input: ProviderInput) => ({
    output: generate.mock.calls.length === 1 ? malformedOutput : validOutput,
    metadata: providerMetadata,
  }));

  await enrichRecord(
    record,
    sourceRecord,
    snapshot,
    { generate },
    {
      vocabularies,
      loadSource: async () => readySource(),
      maxProviderAttempts: 2,
    },
  );

  expect(generate.mock.calls[1]?.[0].repair?.message).toContain(
    'Return summary as an object with "value" and "evidence" fields.',
  );
  expect(generate.mock.calls[1]?.[0].repair?.message).toContain(
    'Return each tag as an object with "id" and "evidence" fields.',
  );
});

test("restates evidence and copy metadata shapes during validation repair", async () => {
  const validOutput = outputFor({
    requestedFields: ["summary", "tags"],
    allowedTags: vocabularies.tags,
  });
  const invalidOutput = {
    ...validOutput,
    summary: {
      value: summary,
      evidence: [{ section: "README" }],
    },
    result: "accepted-with-light-edits",
    change_reasons: ["rewritten"],
  } as unknown as ReturnType<typeof outputFor>;
  const generate = vi.fn(async (_input: ProviderInput) => ({
    output: generate.mock.calls.length === 1 ? invalidOutput : validOutput,
    metadata: providerMetadata,
  }));

  await enrichRecord(
    record,
    sourceRecord,
    snapshot,
    { generate },
    {
      vocabularies,
      loadSource: async () => readySource(),
      maxProviderAttempts: 2,
    },
  );

  const repairMessage = generate.mock.calls[1]?.[0].repair?.message;
  expect(repairMessage).toContain(
    "Return every evidence reference as a non-empty single-line string",
  );
  expect(repairMessage).toContain(
    'Use result "accepted-unchanged" with change_reasons [] and policy_signal "none"',
  );
  expect(repairMessage).toContain(
    'For "accepted-with-light-edits", return one or more allowed light change reasons',
  );
});

test("gives a usable repair when a dotted brand looks like a link", async () => {
  const validOutput = outputFor({
    requestedFields: ["summary", "tags"],
    allowedTags: vocabularies.tags,
  });
  const generate = vi.fn(async (_input: ProviderInput) => ({
    output:
      generate.mock.calls.length === 1
        ? {
            ...validOutput,
            summary: {
              value:
                "Remix.Camera connects SillyTavern character context to companion image tools while keeping credentials in a local bridge and image actions reviewable before generation.",
              evidence: ["readme:1-8"],
            },
          }
        : validOutput,
    metadata: providerMetadata,
  }));

  await enrichRecord(
    record,
    sourceRecord,
    snapshot,
    { generate },
    {
      vocabularies,
      loadSource: async () => readySource(),
      maxProviderAttempts: 2,
    },
  );

  expect(generate.mock.calls[1]?.[0].repair?.message).toContain(
    "refer to the project generically",
  );
});

test("stops after the first validation repair succeeds", async () => {
  const validOutput = outputFor({
    requestedFields: ["summary", "tags"],
    allowedTags: vocabularies.tags,
  });
  const responses = [
    {
      ...validOutput,
      tags: [{ id: "invented", evidence: ["readme:1"] }],
    },
    validOutput,
  ];
  const generate = vi.fn(async (_input: ProviderInput) => ({
    output: responses[generate.mock.calls.length - 1],
    metadata: providerMetadata,
  }));

  await expect(
    enrichRecord(
      record,
      sourceRecord,
      snapshot,
      { generate },
      {
        vocabularies,
        loadSource: async () => readySource(),
        maxProviderAttempts: 2,
      },
    ),
  ).resolves.toEqual(validOutput);
  expect(generate).toHaveBeenCalledTimes(2);
});

test("stops after two validation repairs and throws the latest errors", async () => {
  const responses = ["initial", "first repair", "second repair"].map(
    (attempt) => ({
      ...outputFor({
        requestedFields: ["summary", "tags"],
        allowedTags: vocabularies.tags,
      }),
      summary: {
        value: `${attempt} rejected summary ${"overlong ".repeat(30)}ends here.`,
        evidence: ["readme:1-3"],
      },
    }),
  );
  const generate = vi.fn(async (_input: ProviderInput) => ({
    output: responses[generate.mock.calls.length - 1],
    metadata: providerMetadata,
  }));

  await expect(
    enrichRecord(
      record,
      sourceRecord,
      snapshot,
      { generate },
      {
        vocabularies,
        loadSource: async () => readySource(),
        maxProviderAttempts: 3,
      },
    ),
  ).rejects.toMatchObject({
    code: "output-invalid",
    message: expect.stringContaining(
      "summary value must be 220 characters or fewer",
    ),
  });
  expect(generate).toHaveBeenCalledTimes(3);
});

test("defaults direct enrichment to one provider call", async () => {
  const generate = vi.fn(async (_input: ProviderInput) => ({
    output: {
      ...outputFor({
        requestedFields: ["summary", "tags"],
        allowedTags: vocabularies.tags,
      }),
      summary: {
        value: "Too short.",
        evidence: ["readme:1-3"],
      },
    },
    metadata: providerMetadata,
  }));

  await expect(
    enrichRecord(
      record,
      sourceRecord,
      snapshot,
      { generate },
      { vocabularies, loadSource: async () => readySource() },
    ),
  ).rejects.toMatchObject({
    code: "output-invalid",
    message: expect.stringContaining(
      "summary value must be at least 120 characters",
    ),
  });
  expect(generate).toHaveBeenCalledOnce();
});

test("direct intake can succeed on the fifth provider call", async () => {
  const valid = outputFor({
    requestedFields: ["summary", "tags"],
    allowedTags: vocabularies.tags,
  });
  const responses: ReturnType<typeof outputFor>[] = [
    "Too short 1.",
    "Too short 2.",
    "Too short 3.",
    "Too short 4.",
  ].map((value) => ({
    ...valid,
    summary: { value, evidence: ["readme:1-3"] },
  }));
  responses.push(valid);
  const generate = vi.fn(async (_input: ProviderInput) => ({
    output: responses[generate.mock.calls.length - 1],
    metadata: providerMetadata,
  }));

  await expect(
    enrichRecord(
      record,
      sourceRecord,
      snapshot,
      { generate },
      {
        vocabularies,
        loadSource: async () => readySource(),
        maxProviderAttempts: 5,
      },
    ),
  ).resolves.toEqual(valid);
  expect(generate).toHaveBeenCalledTimes(5);
  expect(generate.mock.calls[4]?.[0].repair).toMatchObject({
    rejectedSummary: "Too short 4.",
  });
});

test("falls back to zero tags after malformed tag repairs without failing the summary", async () => {
  const generate = vi.fn(async () => ({
    output: {
      ...outputFor({
        requestedFields: ["summary"],
        allowedTags: vocabularies.tags,
      }),
      tags: [{ id: "invented", evidence: ["readme:1"] }],
    },
    metadata: providerMetadata,
  }));

  const output = await enrichRecord(
    record,
    sourceRecord,
    snapshot,
    { generate },
    { vocabularies, loadSource: async () => readySource() },
  );

  expect(generate).toHaveBeenCalledOnce();
  expect(output).toMatchObject({
    tags: [],
    tag_generation_diagnostic: "invalid-output-fell-back-empty",
  });
});

test.each(["source-not-ready", "failed"] as const)(
  "does not convert %s source outcomes into curated fallback",
  async (status) => {
    await expect(
      enrichRecord(
        record,
        sourceRecord,
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

test("bulk primary uses one provider call for invalid output", async () => {
  const generate = vi.fn(async () => ({
    output: {
      ...outputFor({
        requestedFields: ["summary", "tags"],
        allowedTags: vocabularies.tags,
      }),
      summary: {
        value: "Too short.",
        evidence: ["readme:1-3"],
      },
    },
    metadata: providerMetadata,
  }));

  const [result] = await runEnrichmentBatch({
    projectIds: ["fixture"],
    recordsById: { fixture: record },
    sourcesById: { [sourceRecord.id]: sourceRecord },
    snapshotsBySourceId: { [sourceRecord.id]: snapshot },
    phase: "primary",
    provider: { generate },
    validateSnapshot: () => true,
    vocabularies,
    loadSource: async () => readySource(),
    writeRecord: vi.fn(),
  });

  expect(result).toMatchObject({
    outcome: "failed",
    reasonCode: "output-invalid",
    providerCallCount: 1,
    providerRepairCallCount: 0,
  });
  expect(generate).toHaveBeenCalledOnce();
});

test("bulk retry stops on the fifth valid response", async () => {
  const valid = outputFor({
    requestedFields: ["summary", "tags"],
    allowedTags: vocabularies.tags,
  });
  const generate = vi.fn(async () => ({
    output:
      generate.mock.calls.length === 5
        ? valid
        : {
            ...valid,
            summary: {
              value: "Too short.",
              evidence: ["readme:1-3"],
            },
          },
    metadata: providerMetadata,
  }));

  const [result] = await runEnrichmentBatch({
    projectIds: ["fixture"],
    recordsById: { fixture: record },
    sourcesById: { [sourceRecord.id]: sourceRecord },
    snapshotsBySourceId: { [sourceRecord.id]: snapshot },
    phase: "retry",
    provider: { generate },
    validateSnapshot: () => true,
    vocabularies,
    loadSource: async () => readySource(),
    writeRecord: vi.fn(),
    previousEntries: {
      fixture: {
        reason_code: "output-invalid",
        message: "summary value must be at least 120 characters",
      },
    } as never,
  });

  expect(result).toMatchObject({
    outcome: "enriched",
    providerCallCount: 5,
    providerRepairCallCount: 5,
  });
  expect(generate).toHaveBeenCalledTimes(5);
});

test("bulk retry stops after five invalid responses", async () => {
  const generate = vi.fn(async () => ({
    output: {
      ...outputFor({
        requestedFields: ["summary", "tags"],
        allowedTags: vocabularies.tags,
      }),
      summary: {
        value: `Too short ${generate.mock.calls.length}.`,
        evidence: ["readme:1-3"],
      },
    },
    metadata: providerMetadata,
  }));

  const [result] = await runEnrichmentBatch({
    projectIds: ["fixture"],
    recordsById: { fixture: record },
    sourcesById: { [sourceRecord.id]: sourceRecord },
    snapshotsBySourceId: { [sourceRecord.id]: snapshot },
    phase: "retry",
    provider: { generate },
    validateSnapshot: () => true,
    vocabularies,
    loadSource: async () => readySource(),
    writeRecord: vi.fn(),
    previousEntries: {
      fixture: {
        reason_code: "output-invalid",
        message: "summary value must be at least 120 characters",
      },
    } as never,
  });

  expect(result).toMatchObject({
    outcome: "failed",
    reasonCode: "output-invalid",
    providerCallCount: 5,
    providerRepairCallCount: 5,
  });
  expect(generate).toHaveBeenCalledTimes(5);
});

test("returns ordered isolated outcomes for a mixed batch", async () => {
  const projectIds = ["description", "fallback", "stale", "offline"];
  const recordsById = Object.fromEntries(
    projectIds.map((id) => [id, recordFor(id)]),
  );
  const sourcesById = Object.fromEntries(
    projectIds.map((id) => [sourceFor(id).id, sourceFor(id)]),
  );
  const snapshotsBySourceId = Object.fromEntries(
    projectIds.map((id) => [sourceFor(id).id, snapshotFor(id)]),
  );
  const writeRecord = vi.fn(async () => {});
  const generate = vi.fn(async (input) => {
    if (input.id === "offline") throw new Error("provider offline");
    return { output: outputFor(input), metadata: providerMetadata };
  });

  const result = await runEnrichmentBatch({
    projectIds,
    recordsById,
    sourcesById,
    snapshotsBySourceId,
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
});

test("runs no more than four model calls concurrently and preserves order", async () => {
  const projectIds = Array.from(
    { length: 12 },
    (_, index) => `project-${index}`,
  );
  let active = 0;
  let maximum = 0;
  const result = await runEnrichmentBatch({
    projectIds,
    recordsById: Object.fromEntries(
      projectIds.map((id) => [id, recordFor(id)]),
    ),
    sourcesById: Object.fromEntries(
      projectIds.map((id) => [sourceFor(id).id, sourceFor(id)]),
    ),
    snapshotsBySourceId: Object.fromEntries(
      projectIds.map((id) => [sourceFor(id).id, snapshotFor(id)]),
    ),
    phase: "primary",
    vocabularies,
    provider: {
      generate: vi.fn(async (input) => {
        active += 1;
        maximum = Math.max(maximum, active);
        const index = Number(input.id.split("-").at(-1));
        await new Promise((resolve) => setTimeout(resolve, (12 - index) % 5));
        active -= 1;
        return { output: outputFor(input), metadata: providerMetadata };
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
  const generate = vi.fn(async (input) => {
    if (input.id.startsWith("rate-limit")) {
      throw Object.assign(new Error("rate limited"), {
        code: "provider-rate-limited",
      });
    }
    return { output: outputFor(input), metadata: providerMetadata };
  });

  const results = await runEnrichmentBatch({
    projectIds,
    recordsById: Object.fromEntries(
      projectIds.map((id) => [id, recordFor(id)]),
    ),
    sourcesById: Object.fromEntries(
      projectIds.map((id) => [sourceFor(id).id, sourceFor(id)]),
    ),
    snapshotsBySourceId: Object.fromEntries(
      projectIds.map((id) => [sourceFor(id).id, snapshotFor(id)]),
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
