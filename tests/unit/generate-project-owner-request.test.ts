import { resolve } from "node:path";

import { expect, test, vi } from "vitest";

import { EnrichmentProviderError } from "../../scripts/catalog/enrichment-provider.mjs";
import {
  fingerprintProjectRecord,
  fingerprintSourceRecord,
} from "../../src/features/help/project-owner-record.mjs";
import { tagVocabularyHash } from "../../scripts/catalog/tag-vocabulary.mjs";
import type { TagVocabulary } from "../../scripts/catalog/tag-vocabulary.mjs";
import {
  fingerprintProjectOwnerManifest,
  generateProjectOwnerRequest,
  parseGenerateProjectOwnerCli,
  readValidatedOwnerReport,
  sameProjectOwnerGenerationReport,
} from "../../scripts/help/generate-project-owner-request.mjs";
import { PROJECT_PUBLICATION_TRANSACTION_MARKER } from "../../scripts/publication/project-publication-transaction.mjs";

const root = resolve("test-fixtures", "owner-request-repository");
const reportPath = resolve(
  "test-fixtures",
  "owner-request-artifacts",
  "owner-123.json",
);
const normalizedRoot = root.replaceAll("\\", "/");
const normalizedReportPath = reportPath.replaceAll("\\", "/");
const projectPath = `${normalizedRoot}/data/registry/projects/owner-alpha.json`;
const sourcePath = `${normalizedRoot}/data/registry/sources/github-42.json`;
const snapshotPath = `${normalizedRoot}/data/snapshots/github/github-42.json`;
const trackedTagVocabulary: TagVocabulary = {
  schema_version: 1,
  tags: [
    {
      id: "automation",
      label: "Automation",
      facet: "goal",
      description: "Automate repository workflows.",
      aliases: [],
      applicable_kinds: ["extension"],
      inclusion_guidance: ["The project automates a workflow."],
      exclusion_guidance: [],
    },
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `manual-tag-${index + 2}`,
      label: `Manual tag ${index + 2}`,
      facet: "trait" as const,
      description: `Manual owner tag ${index + 2}.`,
      aliases: [],
      applicable_kinds: ["extension" as const],
      inclusion_guidance: ["The owner selected this applicable trait."],
      exclusion_guidance: [],
    })),
  ],
};
const currentTagVocabularyHash = tagVocabularyHash(trackedTagVocabulary);

function source(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    id: "github-42",
    type: "github",
    repository: "Owner/Alpha",
    repository_id: 42,
    status: "active",
    status_reason: null,
    refresh_policy: "automatic",
    ...overrides,
  };
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 6,
    id: "owner-alpha",
    source_id: "github-42",
    name: "Alpha",
    kind: "extension",
    summary: "Original summary.",
    metadata_status: "provisional",
    frontends: ["sillytavern"],
    primary_function: "interface-workflow",
    tags: ["automation"],
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
    cataloged_at: "2025-01-01T00:00:00.000Z",
    catalog_cohort: "standard",
    listing_status: "active",
    listing_status_reason: null,
    ...overrides,
  };
}

function editable(
  summary = "Owner-authored summary.",
  options: {
    summaryMode?: "automatic" | "manual";
    tagMode?: "automatic" | "manual";
    tags?: string[];
  } = {},
) {
  const summaryMode = options.summaryMode ?? "manual";
  const tagMode = options.tagMode ?? "automatic";
  return {
    name: "Alpha",
    summary,
    frontends: ["sillytavern"],
    primary_function: "interface-workflow",
    tags: options.tags ?? ["automation"],
    metadata: {
      summary: { mode: summaryMode },
      tags: { mode: tagMode },
    },
    model_families: [],
    completion_formats: [],
  };
}

function editManifest(current = project()) {
  return {
    schema_version: 2,
    request_kind: "project-owner",
    operation: "edit-card",
    tag_vocabulary_hash: currentTagVocabularyHash,
    source_id: "github-42",
    project_id: "owner-alpha",
    repository_id: 42,
    project_fingerprint: fingerprintProjectRecord(current),
    original: { kind: "extension", ...editable("Original summary.") },
    proposed: editable(),
    explanation: null,
  };
}

function addManifest(currentSource = source()) {
  const draft = (draftId: string, name: string, summary: string) => ({
    draft_id: draftId,
    project_id: `owner-alpha-${name.toLocaleLowerCase()}`,
    kind: "extension",
    ...editable(summary),
    name,
  });
  return {
    schema_version: 2,
    request_kind: "project-owner",
    operation: "add-cards",
    tag_vocabulary_hash: currentTagVocabularyHash,
    source_id: "github-42",
    repository_id: 42,
    source_fingerprint: fingerprintSourceRecord(currentSource),
    proposed_cards: [
      draft("draft-b", "Gamma", "Gamma is distinct."),
      draft("draft-a", "Beta", "Beta is distinct."),
    ],
    explanation: "Two distinct offerings.",
  };
}

function moveManifest(currentSource = source()) {
  return {
    schema_version: 2,
    request_kind: "project-owner",
    operation: "move-source",
    source_id: "github-42",
    repository_id: 42,
    source_fingerprint: fingerprintSourceRecord(currentSource),
    original: { repository: "Owner/Alpha", repository_id: 42 },
    proposed: { repository: "Owner/Alpha-Renamed", repository_id: 42 },
    explanation: null,
  };
}

function delistManifest(currentSource = source()) {
  return {
    schema_version: 2,
    request_kind: "project-owner",
    operation: "delist-source",
    source_id: "github-42",
    repository_id: 42,
    source_fingerprint: fingerprintSourceRecord(currentSource),
    original: { status: "active" },
    proposed: {
      status: "delisted",
      status_reason: "removed",
      refresh_policy: "paused",
    },
    delist_confirmation: "Owner/Alpha",
    explanation: null,
  };
}

function issue(manifest: Record<string, unknown>) {
  return {
    number: 123,
    state: "open",
    body: `### Owner request manifest

\`\`\`json
${JSON.stringify(manifest)}
\`\`\``,
    labels: ["issue-admitted", "project-owner-request"],
    user: { id: 100, login: "Owner" },
    author_association: "NONE",
    updated_at: "2026-07-29T12:00:00Z",
  };
}

function addCardsPull(issueNumber: number) {
  return {
    number: issueNumber + 1_000,
    state: "open",
    merged_at: null,
    body: [
      PROJECT_PUBLICATION_TRANSACTION_MARKER,
      JSON.stringify({
        schema_version: 2,
        operation: "add-cards",
        producer: "project-owner-request",
        publication_mode: "manual",
        issue_number: issueNumber,
        project_ids: ["owner-alpha-extra"],
        source_id: "github-42",
        source_identity: {
          type: "github",
          canonical: "github:42",
          repository_id: 42,
        },
        actor: { id: 100, login: "Owner", type: "User" },
        authority_type: "repository-owner",
        input_digest: "b".repeat(64),
        input_fingerprints: { projects: {}, source: "c".repeat(64) },
        base_sha: "d".repeat(40),
        generated_head_sha: "e".repeat(40),
        generated_paths: ["data/registry/projects/owner-alpha-extra.json"],
        policy_version: "2026-07-29",
        copy_result: null,
      }),
      "-->",
    ].join("\n"),
  };
}

function snapshot() {
  return {
    schema_version: 4,
    provider: "github",
    source_id: "github-42",
    repository: {
      id: 42,
      owner: "Owner",
      name: "Alpha",
      url: "https://github.com/Owner/Alpha",
    },
  };
}

const repository = {
  id: 42,
  fullName: "Owner/Alpha",
  htmlUrl: "https://github.com/Owner/Alpha",
  visibility: "public",
  owner: { login: "Owner", type: "User" },
};

function vocabularyFiles() {
  return new Map([
    [
      `${normalizedRoot}/data/vocabularies/frontends.json`,
      JSON.stringify({ frontends: [{ id: "sillytavern" }] }),
    ],
    [
      `${normalizedRoot}/data/vocabularies/primary-functions.json`,
      JSON.stringify({ primary_functions: [{ id: "interface-workflow" }] }),
    ],
    [
      `${normalizedRoot}/data/vocabularies/tags.json`,
      JSON.stringify(trackedTagVocabulary),
    ],
    [
      `${normalizedRoot}/data/vocabularies/model-families.json`,
      JSON.stringify({ model_families: [{ id: "claude" }] }),
    ],
    [
      `${normalizedRoot}/data/vocabularies/completion-formats.json`,
      JSON.stringify({ completion_formats: [{ id: "chat-completion" }] }),
    ],
  ]);
}

function harness(
  manifest: Record<string, unknown>,
  options: {
    repository?: Record<string, unknown>;
    failWritePath?: string;
    mutateProjectOnFinalRead?: boolean;
    staff?: boolean;
    project?: Record<string, unknown>;
    source?: Record<string, unknown>;
  } = {},
) {
  const latest = issue(manifest);
  if (options.staff) {
    latest.user = { id: 2_625_904, login: "MentallyQuill" };
    latest.author_association = "OWNER";
  }
  const currentProject = options.project ?? project();
  const currentSource = options.source ?? source();
  const storage = vocabularyFiles();
  storage.set(
    `${normalizedRoot}/data/registry/projects/${currentProject.id}.json`,
    JSON.stringify(currentProject),
  );
  storage.set(
    `${normalizedRoot}/data/registry/sources/${currentSource.id}.json`,
    JSON.stringify(currentSource),
  );
  storage.set(snapshotPath, JSON.stringify(snapshot()));
  let projectReads = 0;
  const reads: string[] = [];
  const writes: string[] = [];
  const removals: string[] = [];
  const readFile = vi.fn(async (path: string) => {
    const normalized = path.replaceAll("\\", "/");
    reads.push(normalized);
    if (normalized === projectPath) {
      projectReads += 1;
      if (options.mutateProjectOnFinalRead && projectReads >= 2) {
        return JSON.stringify(
          project({ summary: "Concurrent maintainer summary." }),
        );
      }
    }
    if (!storage.has(normalized)) {
      throw Object.assign(new Error(`ENOENT ${normalized}`), {
        code: "ENOENT",
      });
    }
    return storage.get(normalized) as string;
  });
  const readdir = vi.fn(async () =>
    [...storage.keys()]
      .filter(
        (path) =>
          path.startsWith(`${normalizedRoot}/data/registry/projects/`) &&
          path.endsWith(".json"),
      )
      .map((path) => path.split("/").at(-1))
      .filter((name): name is string => typeof name === "string"),
  );
  const request = vi.fn(async (path: string) => {
    if (path === "/repos/Tavernary/Tavernary/issues/123") return latest;
    if (
      path ===
      "/repos/Tavernary/Tavernary/issues?state=open&labels=project-owner-request&per_page=100"
    ) {
      return [latest];
    }
    if (path === "/repos/Tavernary/Tavernary/pulls?state=open&per_page=100") {
      return [];
    }
    if (path === "/repositories/42") {
      return { ...repository, ...(options.repository ?? {}) };
    }
    throw new Error(`unexpected request ${path}`);
  });
  const writeFile = vi.fn(async (path: string, value: string) => {
    const normalized = path.replaceAll("\\", "/");
    writes.push(normalized);
    if (normalized === options.failWritePath) throw new Error("write failed");
    storage.set(normalized, value);
  });
  const rm = vi.fn(async (path: string) => {
    const normalized = path.replaceAll("\\", "/");
    removals.push(normalized);
    storage.delete(normalized);
  });
  return {
    latest,
    storage,
    reads,
    writes,
    removals,
    readFile,
    readdir,
    request,
    writeFile,
    rm,
  };
}

async function generate(
  fixture: ReturnType<typeof harness>,
  overrides: Record<string, unknown> = {},
) {
  return generateProjectOwnerRequest({
    issue: fixture.latest,
    hostRepository: "Tavernary/Tavernary",
    root,
    reportPath,
    request: fixture.request,
    readFile: fixture.readFile,
    readdir: fixture.readdir,
    writeFile: fixture.writeFile,
    rm: fixture.rm,
    mkdir: vi.fn(async () => undefined),
    now: "2026-07-29T13:00:00.000Z",
    ...overrides,
  });
}

test("fingerprints every normalized request field", () => {
  const manifest = editManifest();
  expect(fingerprintProjectOwnerManifest(manifest)).toBe(
    fingerprintProjectOwnerManifest(structuredClone(manifest)),
  );
  expect(
    fingerprintProjectOwnerManifest({
      ...manifest,
      explanation: "A public explanation.",
    }),
  ).not.toBe(fingerprintProjectOwnerManifest(manifest));
});

test("does not load generator targets from readable owner identifiers", async () => {
  const fixture = harness(editManifest());
  fixture.latest.body = `
### Request type

Edit card details

### Source ID

github-42

### Project ID

owner-alpha

### Owner request manifest

_No response_
`;

  await expect(generate(fixture)).rejects.toThrow(
    "owner-request-invalid: Source ID is missing.",
  );
  expect(fixture.reads).toEqual([]);
  expect(fixture.writes).toEqual([]);
});

test("compares reports with sorted project arrays while preserving exact source identity", () => {
  const base = {
    schema_version: 2,
    generated_at: "2026-07-29T13:00:00.000Z",
    project_ids: ["b", "a"],
    source_identity: {
      type: "github",
      canonical: "github:42",
      repository_id: 42,
    },
    before: [{ id: "b" }, { id: "a" }],
    after: [{ id: "b" }, { id: "a" }],
  };
  expect(
    sameProjectOwnerGenerationReport(base, {
      ...base,
      generated_at: "2026-07-29T13:05:00.000Z",
      project_ids: ["a", "b"],
      before: [{ id: "a" }, { id: "b" }],
      after: [{ id: "a" }, { id: "b" }],
    }),
  ).toBe(true);
  expect(
    sameProjectOwnerGenerationReport(base, {
      ...base,
      source_identity: { ...base.source_identity, repository_id: 84 },
    }),
  ).toBe(false);
});

test("replays one validated automatic metadata result without calling the provider again", async () => {
  const manifest = editManifest();
  manifest.original = {
    kind: "extension",
    ...editable("Original summary.", {
      summaryMode: "automatic",
      tagMode: "automatic",
    }),
  };
  manifest.proposed = {
    ...editable("Original summary.", {
      summaryMode: "automatic",
      tagMode: "automatic",
    }),
    name: "Alpha Renamed",
  };
  const firstFixture = harness(manifest);
  const firstProvider = vi.fn(async () => ({
    summary: {
      value:
        "Alpha provides a source-grounded workflow for repository automation and keeps catalog metadata aligned with its documented behavior.",
      evidence: ["readme:4-10"],
    },
    tags: [{ id: "automation", evidence: ["readme:12-18"] }],
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  }));
  const first = await generate(firstFixture, {
    enrichMetadata: firstProvider,
  });

  const replayFixture = harness(manifest);
  const replayProvider = vi.fn(async () => {
    throw new Error("provider must not run during validated replay");
  });
  const replayed = await generate(replayFixture, {
    enrichMetadata: replayProvider,
    validatedReport: first.report,
  });

  expect(firstProvider).toHaveBeenCalledOnce();
  expect(replayProvider).not.toHaveBeenCalled();
  expect(first.report.resolved_metadata).toEqual({
    "owner-alpha": {
      summary:
        "Alpha provides a source-grounded workflow for repository automation and keeps catalog metadata aligned with its documented behavior.",
      tags: ["automation"],
    },
  });
  expect(sameProjectOwnerGenerationReport(first.report, replayed.report)).toBe(
    true,
  );
  expect(replayFixture.storage.get(projectPath)).toBe(
    firstFixture.storage.get(projectPath),
  );
});

test("rejects validated metadata replay when trusted request identity changed", async () => {
  const manifest = editManifest();
  manifest.proposed = editable("Owner-authored summary.", {
    summaryMode: "manual",
    tagMode: "manual",
  });
  const firstFixture = harness(manifest);
  const first = await generate(firstFixture);
  const staleReport = structuredClone(first.report);
  staleReport.request_fingerprint = "f".repeat(64);
  const replayFixture = harness(manifest);
  const replayProvider = vi.fn();

  await expect(
    generate(replayFixture, {
      enrichMetadata: replayProvider,
      validatedReport: staleReport,
    }),
  ).rejects.toMatchObject({
    code: "validated-owner-report-stale",
  });
  expect(replayProvider).not.toHaveBeenCalled();
  expect(replayFixture.writes).toEqual([]);
});

test("rejects validated replay when the source record changed", async () => {
  const manifest = editManifest();
  manifest.proposed = editable("Owner-authored summary.", {
    summaryMode: "manual",
    tagMode: "manual",
  });
  const first = await generate(harness(manifest));
  const replayFixture = harness(manifest, {
    source: source({ refresh_policy: "paused" }),
  });

  await expect(
    generate(replayFixture, { validatedReport: first.report }),
  ).rejects.toMatchObject({
    code: "validated-owner-report-stale",
  });
  expect(replayFixture.writes).toEqual([]);
});

test("rejects malformed resolved metadata before replay writes", async () => {
  const manifest = editManifest();
  manifest.proposed = editable("Owner-authored summary.", {
    summaryMode: "manual",
    tagMode: "manual",
  });
  const first = await generate(harness(manifest));
  const invalidReport = structuredClone(first.report);
  invalidReport.resolved_metadata = {};
  const replayFixture = harness(manifest);

  await expect(
    generate(replayFixture, { validatedReport: invalidReport }),
  ).rejects.toMatchObject({
    code: "validated-owner-report-invalid",
  });
  expect(replayFixture.writes).toEqual([]);
});

test("parses an optional validated report path for guarded replay", () => {
  expect(
    parseGenerateProjectOwnerCli([
      "--issue-number",
      "175",
      "--output-directory",
      "F:/git/Tavernary",
      "--report-path",
      "C:/tmp/generated.json",
      "--validated-report-path",
      "C:/tmp/validated.json",
    ]),
  ).toEqual({
    issueNumber: 175,
    root: "F:/git/Tavernary",
    reportPath: "C:/tmp/generated.json",
    validatedReportPath: "C:/tmp/validated.json",
  });
});

test("normalizes unreadable validated reports as invalid replay input", async () => {
  await expect(
    readValidatedOwnerReport("C:/tmp/missing.json", async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    }),
  ).rejects.toMatchObject({
    code: "validated-owner-report-invalid",
  });
  await expect(
    readValidatedOwnerReport("C:/tmp/malformed.json", async () => "{not-json"),
  ).rejects.toMatchObject({
    code: "validated-owner-report-invalid",
  });
});

test("revalidates and writes one card edit with a card-scoped input fingerprint", async () => {
  const manifest = editManifest();
  manifest.proposed.summary = "Owner-authored summary";
  const fixture = harness(manifest);
  const copySummary = vi.fn(async () => ({
    summary: "Owner-authored summary.",
    result: "accepted-with-light-edits",
    change_reasons: ["punctuation-corrected"],
    policy_signal: "none",
  }));
  const generated = await generate(fixture, {
    copySummary,
    enrichMetadata: async () => ({
      tags: [{ id: "automation", evidence: ["readme:1-2"] }],
    }),
  });
  expect(generated.generatedPaths).toEqual([
    "data/registry/projects/owner-alpha.json",
  ]);
  expect(fixture.writes).toEqual([projectPath, normalizedReportPath]);
  expect(JSON.parse(fixture.storage.get(projectPath) ?? "")).toMatchObject({
    summary: "Owner-authored summary.",
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "Verified repository owner selection.",
      },
      tags: { mode: "automatic" },
    },
  });
  expect(copySummary).toHaveBeenCalledWith(
    expect.objectContaining({
      authorityType: "repository-owner",
      submittedSummary: "Owner-authored summary",
    }),
  );
  expect(generated.report).toMatchObject({
    schema_version: 2,
    project_ids: ["owner-alpha"],
    source_id: "github-42",
    operation: "edit-card",
    publication_mode: "automatic",
    input_fingerprints: {
      projects: {
        "owner-alpha": expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
      source: null,
    },
    submitted_summary: "Owner-authored summary",
    published_summary: "Owner-authored summary.",
    copy_mode: "preserve",
    copy_result: {
      result: "accepted-with-light-edits",
      change_reasons: ["punctuation-corrected"],
      policy_signal: "none",
    },
  });
});

test("keeps verified owner copy for manual review when copy review is unavailable", async () => {
  const manifest = editManifest();
  manifest.proposed.summary = "Owner-authored summary stays exact";
  const fixture = harness(manifest);
  const copySummary = vi.fn(async () => {
    throw new EnrichmentProviderError(
      "provider-response-invalid",
      "json-invalid",
      { latencyMs: 300 },
    );
  });

  const generated = await generate(fixture, {
    copySummary,
    enrichMetadata: async () => ({
      tags: [{ id: "automation", evidence: ["readme:1-2"] }],
    }),
  });

  expect(copySummary).toHaveBeenCalledOnce();
  expect(JSON.parse(fixture.storage.get(projectPath) ?? "")).toMatchObject({
    summary: "Owner-authored summary stays exact",
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "Verified repository owner selection.",
      },
    },
  });
  expect(generated.report).toMatchObject({
    publication_mode: "manual",
    submitted_summary: "Owner-authored summary stays exact",
    published_summary: "Owner-authored summary stays exact",
    copy_mode: "preserve",
    copy_result: null,
    copy_results: [
      {
        project_id: "owner-alpha",
        mode: "preserve",
        review_status: "unavailable",
        reason_code: "copy-review-unavailable",
        diagnostic: {
          failure_phase: "initial-provider",
          failure_code: "provider-response-invalid",
          diagnostic_code: "json-invalid",
          attempt_count: 1,
          latency_ms: 300,
        },
        submitted_summary: "Owner-authored summary stays exact",
        published_summary: "Owner-authored summary stays exact",
        copy_result: null,
      },
    ],
  });
});

test("writes one owner-selected summary and six manual tags to only the selected card", async () => {
  const manifest = editManifest();
  const manualTags = [
    "automation",
    "manual-tag-2",
    "manual-tag-3",
    "manual-tag-4",
    "manual-tag-5",
    "manual-tag-6",
  ];
  manifest.proposed = editable("Owner-authored manual summary.", {
    summaryMode: "manual",
    tagMode: "manual",
    tags: manualTags,
  });
  const fixture = harness(manifest);

  const generated = await generate(fixture, {
    copySummary: async ({
      submittedSummary,
    }: {
      submittedSummary: string;
    }) => ({
      summary: submittedSummary,
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    }),
  });

  expect(generated.generatedPaths).toEqual([
    "data/registry/projects/owner-alpha.json",
  ]);
  expect(fixture.writes).toEqual([projectPath, normalizedReportPath]);
  expect(JSON.parse(fixture.storage.get(projectPath) ?? "")).toMatchObject({
    summary: "Owner-authored manual summary.",
    tags: manualTags,
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "Verified repository owner selection.",
      },
      tags: {
        mode: "manual",
        note: "Verified repository owner selection.",
      },
    },
  });
});

test("writes a two-card add batch atomically and marks the combined publication manual", async () => {
  const manifest = addManifest();
  for (const card of manifest.proposed_cards) {
    card.metadata = {
      summary: { mode: "manual" },
      tags: { mode: "manual" },
    };
  }
  const fixture = harness(manifest);
  const generated = await generate(fixture, {
    copySummary: async ({
      submittedSummary,
    }: {
      submittedSummary: string;
    }) => ({
      summary: submittedSummary,
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    }),
  });
  const betaPath = `${normalizedRoot}/data/registry/projects/owner-alpha-beta.json`;
  const gammaPath = `${normalizedRoot}/data/registry/projects/owner-alpha-gamma.json`;
  expect(generated.generatedPaths).toEqual([
    "data/registry/projects/owner-alpha-beta.json",
    "data/registry/projects/owner-alpha-gamma.json",
  ]);
  expect(fixture.writes).toEqual([betaPath, gammaPath, normalizedReportPath]);
  expect(generated.report).toMatchObject({
    project_ids: ["owner-alpha-beta", "owner-alpha-gamma"],
    source_id: "github-42",
    operation: "add-cards",
    publication_mode: "manual",
    input_fingerprints: {
      projects: {},
      source: expect.stringMatching(/^[a-f0-9]{64}$/u),
    },
  });
  expect(fixture.storage.has(sourcePath)).toBe(true);
  expect(fixture.writes).not.toContain(sourcePath);
});

test("preserves a manual summary and generates only automatic tags", async () => {
  const manifest = editManifest();
  manifest.proposed = editable("Owner summary.", {
    summaryMode: "manual",
    tagMode: "automatic",
  });
  const fixture = harness(manifest);
  const copySummary = vi.fn(async () => ({
    summary: "Owner summary.",
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  }));
  const enrichMetadata = vi.fn(async () => ({
    tags: [{ id: "automation", evidence: ["readme:12-18"] }],
  }));

  const generated = await generate(fixture, {
    copySummary,
    enrichMetadata,
  });
  const written = JSON.parse(fixture.storage.get(projectPath) ?? "");

  expect(copySummary).toHaveBeenCalledOnce();
  expect(enrichMetadata).toHaveBeenCalledWith(
    expect.objectContaining({
      requestedFields: ["tags"],
      record: expect.objectContaining({
        metadata_policy: {
          summary: expect.objectContaining({ mode: "manual" }),
          tags: { mode: "automatic" },
        },
      }),
    }),
  );
  expect(written).toMatchObject({
    summary: "Owner summary.",
    tags: ["automation"],
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "Verified repository owner selection.",
      },
      tags: { mode: "automatic" },
    },
  });
  expect(generated.report.metadata_results).toEqual([
    expect.objectContaining({
      project_id: "owner-alpha",
      requested_fields: ["tags"],
    }),
  ]);
});

test("generates an automatic summary without changing manual tags", async () => {
  const manifest = editManifest();
  manifest.proposed = editable("Original summary.", {
    summaryMode: "automatic",
    tagMode: "manual",
    tags: ["automation"],
  });
  const fixture = harness(manifest);
  const copySummary = vi.fn();
  const enrichMetadata = vi.fn(async () => ({
    summary: {
      value:
        "Alpha generates source-grounded metadata for repository projects and keeps each catalog entry aligned with its documented behavior. It explains the workflow without reusing cloned card copy.",
      evidence: ["readme:4-10"],
    },
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  }));

  const generated = await generate(fixture, {
    copySummary,
    enrichMetadata,
  });
  const written = JSON.parse(fixture.storage.get(projectPath) ?? "");

  expect(copySummary).not.toHaveBeenCalled();
  expect(enrichMetadata).toHaveBeenCalledWith(
    expect.objectContaining({ requestedFields: ["summary"] }),
  );
  expect(written).toMatchObject({
    summary:
      "Alpha generates source-grounded metadata for repository projects and keeps each catalog entry aligned with its documented behavior. It explains the workflow without reusing cloned card copy.",
    tags: ["automation"],
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: {
        mode: "manual",
        note: "Verified repository owner selection.",
      },
    },
  });
  expect(generated.report).toMatchObject({
    copy_mode: "synthesize",
    copy_result: {
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    },
  });
});

test("generates automatic summary and tags independently for every add-card sibling", async () => {
  const manifest = addManifest();
  for (const card of manifest.proposed_cards) {
    card.metadata = {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    };
  }
  const fixture = harness(manifest);
  const copySummary = vi.fn();
  const enrichMetadata = vi.fn(
    async ({
      record,
    }: {
      record: { id: string };
      requestedFields: string[];
    }) => ({
      summary: {
        value: `${record.id} provides a distinct repository offering with source-grounded behavior and independently selected catalog metadata. This summary stays specific to the sibling card instead of cloning another entry.`,
        evidence: [`readme:${record.id}`],
      },
      tags: [{ id: "automation", evidence: [`readme:${record.id}`] }],
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    }),
  );

  const generated = await generate(fixture, {
    copySummary,
    enrichMetadata,
  });

  expect(copySummary).not.toHaveBeenCalled();
  expect(enrichMetadata).toHaveBeenCalledTimes(2);
  expect(
    enrichMetadata.mock.calls.map(([call]) => ({
      id: call.record.id,
      requestedFields: call.requestedFields,
    })),
  ).toEqual([
    {
      id: "owner-alpha-beta",
      requestedFields: ["summary", "tags"],
    },
    {
      id: "owner-alpha-gamma",
      requestedFields: ["summary", "tags"],
    },
  ]);
  for (const projectId of ["owner-alpha-beta", "owner-alpha-gamma"] as const) {
    const path = `${normalizedRoot}/data/registry/projects/${projectId}.json`;
    expect(JSON.parse(fixture.storage.get(path) ?? "")).toMatchObject({
      summary: `${projectId} provides a distinct repository offering with source-grounded behavior and independently selected catalog metadata. This summary stays specific to the sibling card instead of cloning another entry.`,
      tags: ["automation"],
      metadata_policy: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
    });
  }
  expect(generated.report.metadata_results).toHaveLength(2);
});

test("loads shared source evidence once while generating sibling cards independently", async () => {
  const manifest = addManifest();
  for (const card of manifest.proposed_cards) {
    card.metadata = {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    };
  }
  const fixture = harness(manifest);
  const loadEnrichmentSource = vi.fn(async () => ({
    status: "ready" as const,
    sourceKind: "readme" as const,
    sourceIdentity: "github:owner/alpha",
    text: "Shared README evidence for the repository.",
    repositoryDescription: "Repository description.",
    readmeText: "Shared README evidence for the repository.",
    readmePath: "README.md",
    readmeRef: "a".repeat(40),
    readmeIdentity: `github:owner/alpha@${"a".repeat(40)}:README.md`,
    repositoryId: 42,
    headSha: "a".repeat(40),
  }));
  const generateMetadata = vi.fn(async (input) => ({
    output: {
      summary: {
        value: `${input.id} provides a distinct repository offering with source-grounded catalog metadata. It reuses one shared README load while classifying this sibling independently from other offerings.`,
        evidence: [`readme:${input.id}`],
      },
      tags: [{ id: "automation", evidence: [`readme:${input.id}`] }],
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    },
    metadata: {
      requestedModel: "MiniMax-M3",
      returnedModel: "MiniMax-M3",
      latencyMs: 10,
    },
  }));

  await generate(fixture, {
    loadEnrichmentSource,
    enrichmentProvider: { generate: generateMetadata },
  });

  expect(loadEnrichmentSource).toHaveBeenCalledOnce();
  expect(generateMetadata).toHaveBeenCalledTimes(2);
  expect(generateMetadata.mock.calls.map(([input]) => input.id)).toEqual([
    "owner-alpha-beta",
    "owner-alpha-gamma",
  ]);
});

test("blocks the atomic batch when automatic summary evidence has no usable copy", async () => {
  const manifest = addManifest();
  for (const card of manifest.proposed_cards) {
    card.metadata = {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    };
  }
  const fixture = harness(manifest);

  await expect(
    generate(fixture, {
      loadEnrichmentSource: vi.fn(async () => ({
        status: "fallback",
        sourceKind: "confirmed-fallback",
        sourceIdentity: "github:owner/alpha",
        repositoryId: 42,
        headSha: "a".repeat(40),
        readmePath: null,
        readmeRef: "a".repeat(40),
      })),
      enrichmentProvider: { generate: vi.fn() },
    }),
  ).rejects.toThrow(/summary|sentence|placeholder/iu);
  expect(fixture.writes).toEqual([]);
});

test("paginates open pull requests before admitting a source-scoped batch", async () => {
  const fixture = harness(addManifest());
  const firstPullPage = Array.from({ length: 100 }, (_, index) => ({
    number: index + 1,
    state: "open",
    merged_at: null,
    body: "ordinary pull request",
  }));
  const request = vi.fn(async (path: string) => {
    if (path === "/repos/Tavernary/Tavernary/issues/123") {
      return fixture.latest;
    }
    if (
      path ===
      "/repos/Tavernary/Tavernary/issues?state=open&labels=project-owner-request&per_page=100"
    ) {
      return [fixture.latest];
    }
    if (path === "/repos/Tavernary/Tavernary/pulls?state=open&per_page=100") {
      return firstPullPage;
    }
    if (
      path === "/repos/Tavernary/Tavernary/pulls?state=open&per_page=100&page=2"
    ) {
      return [addCardsPull(124)];
    }
    return fixture.request(path);
  });

  await expect(generate(fixture, { request })).rejects.toThrow(
    "source-request-already-open",
  );
  expect(request).toHaveBeenCalledWith(
    "/repos/Tavernary/Tavernary/pulls?state=open&per_page=100&page=2",
  );
  expect(fixture.writes).toEqual([]);
});

test("fails closed when tag-only automatic generation fails", async () => {
  const manifest = editManifest();
  manifest.proposed = editable("Owner summary.", {
    summaryMode: "manual",
    tagMode: "automatic",
  });
  const fixture = harness(manifest);
  await expect(
    generate(fixture, {
      copySummary: async () => ({
        summary: "Owner summary.",
        result: "accepted-unchanged",
        change_reasons: [],
        policy_signal: "none",
      }),
      enrichMetadata: async () => {
        throw Object.assign(new Error("provider unavailable"), {
          code: "provider-network-error",
        });
      },
    }),
  ).rejects.toThrow("provider unavailable");
  expect(fixture.writes).toEqual([]);
});

test("fails the atomic write when automatic summary generation fails", async () => {
  const manifest = editManifest();
  manifest.proposed = editable("Original summary.", {
    summaryMode: "automatic",
    tagMode: "manual",
  });
  const fixture = harness(manifest);

  await expect(
    generate(fixture, {
      enrichMetadata: async () => {
        throw Object.assign(new Error("provider unavailable"), {
          code: "provider-network-error",
        });
      },
    }),
  ).rejects.toThrow("provider unavailable");
  expect(fixture.writes).toEqual([]);
});

test("records trusted staff provenance for manual summary and tags", async () => {
  const manifest = editManifest();
  manifest.proposed = editable("Staff-authored summary.", {
    summaryMode: "manual",
    tagMode: "manual",
  });
  const fixture = harness(manifest, { staff: true });
  const generated = await generate(fixture, {
    copySummary: async () => ({
      summary: "Staff-authored summary.",
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    }),
  });

  expect(JSON.parse(fixture.storage.get(projectPath) ?? "")).toMatchObject({
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "Trusted Tavernary editor selection.",
      },
      tags: {
        mode: "manual",
        note: "Trusted Tavernary editor selection.",
      },
    },
  });
  expect(generated.report.authority_type).toBe("tavernary-staff");
});

test("lets trusted staff generate an edit for a non-GitHub listing", async () => {
  const currentSource = source({
    id: "url-reddit-1v9u18m",
    type: "url",
    repository: undefined,
    repository_id: undefined,
    url: "https://www.reddit.com/r/SillyTavernAI/comments/1v9u18m/example/",
    refresh_policy: "paused",
  });
  const currentProject = project({
    id: "reddit-card",
    source_id: currentSource.id,
  });
  const manifest = {
    ...editManifest(currentProject),
    source_id: currentSource.id,
    project_id: currentProject.id,
    repository_id: null,
    project_fingerprint: fingerprintProjectRecord(currentProject),
    proposed: {
      ...editable("Staff-authored summary.", {
        summaryMode: "manual",
        tagMode: "manual",
      }),
      name: "Reddit Card Renamed",
    },
  };
  const fixture = harness(manifest, {
    staff: true,
    project: currentProject,
    source: currentSource,
  });

  const generated = await generate(fixture);

  expect(generated.report).toMatchObject({
    authority_type: "tavernary-staff",
    repository_id: null,
    source_identity: null,
  });
  expect(
    JSON.parse(
      fixture.storage.get(
        `${normalizedRoot}/data/registry/projects/reddit-card.json`,
      ) ?? "",
    ),
  ).toMatchObject({
    name: "Reddit Card Renamed",
    summary: "Staff-authored summary.",
  });
  expect(
    fixture.request.mock.calls.some(([path]) => path === "/repositories/42"),
  ).toBe(false);
});

test("rejects a stale tag vocabulary before generation writes", async () => {
  const fixture = harness({
    ...editManifest(),
    tag_vocabulary_hash: "e".repeat(64),
  });

  await expect(generate(fixture)).rejects.toMatchObject({
    code: "tag-vocabulary-stale",
  });
  expect(fixture.writes).toEqual([]);
});

test("moves only the shared source and source-owned snapshot", async () => {
  const fixture = harness(moveManifest(), {
    repository: {
      fullName: "Owner/Alpha-Renamed",
      htmlUrl: "https://github.com/Owner/Alpha-Renamed",
    },
  });
  const generated = await generate(fixture);
  expect(generated.generatedPaths).toEqual([
    "data/registry/sources/github-42.json",
    "data/snapshots/github/github-42.json",
  ]);
  expect(fixture.writes).toEqual([
    sourcePath,
    snapshotPath,
    normalizedReportPath,
  ]);
  expect(JSON.parse(fixture.storage.get(sourcePath) ?? "")).toMatchObject({
    id: "github-42",
    repository: "Owner/Alpha-Renamed",
    repository_id: 42,
  });
});

test("delists only the shared source while listing all affected cards", async () => {
  const fixture = harness(delistManifest());
  const generated = await generate(fixture);
  expect(generated.generatedPaths).toEqual([
    "data/registry/sources/github-42.json",
  ]);
  expect(generated.report.project_ids).toEqual(["owner-alpha"]);
  expect(JSON.parse(fixture.storage.get(sourcePath) ?? "")).toMatchObject({
    status: "delisted",
    status_reason: "removed",
    refresh_policy: "paused",
  });
  expect(fixture.writes).toEqual([sourcePath, normalizedReportPath]);
});

test("stops without writes when a card changes during final revalidation", async () => {
  const fixture = harness(editManifest(), {
    mutateProjectOnFinalRead: true,
  });
  await expect(generate(fixture)).rejects.toThrow("stale-owner-request");
  expect(fixture.writeFile).not.toHaveBeenCalled();
});

test("rejects a report path inside repository output before any request or write", async () => {
  const fixture = harness(editManifest());
  await expect(
    generate(fixture, { reportPath: resolve(root, "report.json") }),
  ).rejects.toThrow("outside the repository output");
  expect(fixture.request).not.toHaveBeenCalled();
  expect(fixture.writeFile).not.toHaveBeenCalled();
});

test("removes a newly written card when a later file in the batch fails", async () => {
  const betaPath = `${normalizedRoot}/data/registry/projects/owner-alpha-beta.json`;
  const gammaPath = `${normalizedRoot}/data/registry/projects/owner-alpha-gamma.json`;
  const manifest = addManifest();
  for (const card of manifest.proposed_cards) {
    card.metadata = {
      summary: { mode: "manual" },
      tags: { mode: "manual" },
    };
  }
  const fixture = harness(manifest, { failWritePath: gammaPath });
  await expect(
    generate(fixture, {
      copySummary: async ({
        submittedSummary,
      }: {
        submittedSummary: string;
      }) => ({
        summary: submittedSummary,
        result: "accepted-unchanged",
        change_reasons: [],
        policy_signal: "none",
      }),
    }),
  ).rejects.toThrow("write failed");
  expect(fixture.storage.has(betaPath)).toBe(false);
  expect(fixture.storage.has(gammaPath)).toBe(false);
  expect(fixture.removals).toContain(betaPath);
  expect(fixture.storage.has(normalizedReportPath)).toBe(false);
});
