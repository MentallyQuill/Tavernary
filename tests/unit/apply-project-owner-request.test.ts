import { expect, test } from "vitest";

import { formatJson } from "../../scripts/catalog/json-format.mjs";
import { applyProjectOwnerRequest } from "../../scripts/help/apply-project-owner-request.mjs";
import {
  fingerprintProjectRecord,
  fingerprintSourceRecord,
} from "../../src/features/help/project-owner-record.mjs";

const source = {
  schema_version: 1,
  id: "github-42",
  type: "github",
  repository: "Owner/Alpha",
  repository_id: 42,
  status: "active",
  status_reason: null,
  refresh_policy: "automatic",
};

const project = {
  schema_version: 6,
  id: "owner-alpha",
  name: "Alpha",
  kind: "extension",
  summary: "The original summary.",
  metadata_status: "curated",
  source_id: "github-42",
  frontends: ["sillytavern"],
  primary_function: "interface-workflow",
  tags: ["automate-workflows"],
  metadata_policy: {
    summary: { mode: "automatic" },
    tags: { mode: "manual", note: "Earlier trusted tag selection." },
  },
  cataloged_at: "2026-07-23T00:00:00.000Z",
  catalog_cohort: "seed",
  listing_status: "active",
  listing_status_reason: null,
};

const snapshot = {
  schema_version: 4,
  provider: "github",
  source_id: "github-42",
  repository: {
    id: 42,
    owner: "Owner",
    name: "Alpha",
    url: "https://github.com/Owner/Alpha",
    description: "Original repository description.",
    default_branch: "main",
    head_sha: "a".repeat(40),
  },
  activity: { marker: "history stays" },
};

const currentTagVocabularyHash = "f".repeat(64);
const vocabularies = {
  frontends: ["sillytavern", "risuai"],
  primaryFunctions: [
    "frontend",
    "preset",
    "interface-workflow",
    "generation-reasoning",
  ],
  tags: [
    {
      id: "automate-workflows",
      applicable_kinds: ["frontend", "extension"],
    },
    {
      id: "creative-writing",
      applicable_kinds: ["frontend", "extension", "preset"],
    },
  ],
  modelFamilies: ["claude", "gemini"],
  completionFormats: ["chat-completion", "text-completion"],
  tagVocabularyHash: currentTagVocabularyHash,
};

const originalCard = {
  kind: "extension",
  name: "Alpha",
  summary: "The original summary.",
  frontends: ["sillytavern"],
  primary_function: "interface-workflow",
  tags: ["automate-workflows"],
  metadata: {
    summary: { mode: "automatic" },
    tags: { mode: "manual" },
  },
  model_families: [],
  completion_formats: [],
};

function base(operation: string) {
  return {
    schema_version: 2,
    request_kind: "project-owner",
    operation,
    source_id: source.id,
    repository_id: source.repository_id,
    ...(["edit-card", "add-cards"].includes(operation)
      ? { tag_vocabulary_hash: currentTagVocabularyHash }
      : {}),
    explanation: null,
  };
}

function editManifest() {
  return {
    ...base("edit-card"),
    project_id: project.id,
    project_fingerprint: fingerprintProjectRecord(project),
    original: originalCard,
    proposed: {
      name: "Alpha Updated",
      summary: "Owner-authored summary.",
      frontends: ["sillytavern", "risuai"],
      primary_function: "generation-reasoning",
      tags: ["creative-writing"],
      metadata: {
        summary: { mode: "manual" },
        tags: { mode: "automatic" },
      },
      model_families: [],
      completion_formats: [],
    },
  };
}

function draft(name: string, kind: "extension" | "preset" = "extension") {
  const slug = name.toLocaleLowerCase().replace(/\s+/gu, "-");
  return {
    draft_id: `draft-${slug}`,
    project_id: `owner-alpha-${slug}`,
    name,
    kind,
    summary: `${name} from the Alpha repository.`,
    frontends: ["sillytavern"],
    primary_function: kind === "preset" ? "preset" : "interface-workflow",
    tags: ["creative-writing"],
    metadata: {
      summary: { mode: "manual" as const },
      tags: { mode: "automatic" as const },
    },
    model_families: kind === "preset" ? ["claude"] : [],
    completion_formats: kind === "preset" ? ["chat-completion"] : [],
  };
}

function input(manifest: object, overrides: Record<string, unknown> = {}) {
  const request = manifest as {
    operation?: string;
    project_id?: string;
    proposed?: {
      summary?: string;
      tags?: string[];
    };
    proposed_cards?: Array<{
      project_id: string;
      summary: string;
      tags: string[];
    }>;
  };
  const resolvedMetadataByProjectId =
    request.operation === "edit-card" && request.project_id && request.proposed
      ? {
          [request.project_id]: {
            summary: request.proposed.summary ?? "",
            tags: request.proposed.tags ?? [],
          },
        }
      : Object.fromEntries(
          (request.proposed_cards ?? []).map((card) => [
            card.project_id,
            { summary: card.summary, tags: card.tags },
          ]),
        );
  return {
    issueNumber: 123,
    authorityType: "repository-owner" as const,
    manifest,
    projects: [structuredClone(project)],
    source: structuredClone(source),
    snapshot: structuredClone(snapshot),
    catalogedAt: "2026-07-29T18:00:00.000Z",
    vocabularies,
    resolvedMetadataByProjectId,
    ...overrides,
  };
}

test("edits one card with independent trusted metadata policies", () => {
  const originalInput = input(editManifest());
  const before = structuredClone(originalInput);
  const result = applyProjectOwnerRequest(originalInput);

  expect(result.projects).toEqual([
    expect.objectContaining({
      id: "owner-alpha",
      name: "Alpha Updated",
      summary: "Owner-authored summary.",
      frontends: ["sillytavern", "risuai"],
      primary_function: "generation-reasoning",
      tags: ["creative-writing"],
      metadata_policy: {
        summary: {
          mode: "manual",
          note: "Verified repository owner selection.",
        },
        tags: { mode: "automatic" },
      },
    }),
  ]);
  expect(result.source).toEqual(source);
  expect(result.snapshot).toEqual(snapshot);
  expect(result.changedPaths).toEqual([
    "data/registry/projects/owner-alpha.json",
  ]);
  expect(originalInput).toEqual(before);
});

test("adds one to ten complete cards atomically without changing the source", () => {
  const cards = [draft("Beta"), draft("Gamma Preset", "preset")];
  const result = applyProjectOwnerRequest(
    input({
      ...base("add-cards"),
      source_fingerprint: fingerprintSourceRecord(source),
      proposed_cards: cards,
    }),
  );

  expect(result.projects).toHaveLength(2);
  expect(result.projects[0]).toMatchObject({
    schema_version: 6,
    id: "owner-alpha-beta",
    source_id: "github-42",
    listing_status: "active",
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "Verified repository owner selection.",
      },
      tags: { mode: "automatic" },
    },
  });
  expect(result.projects[1]).toMatchObject({
    id: "owner-alpha-gamma-preset",
    kind: "preset",
    model_families: ["claude"],
    completion_formats: ["chat-completion"],
  });
  expect(result.source).toEqual(source);
  expect(result.snapshot).toEqual(snapshot);
  expect(result.changedPaths).toEqual([
    "data/registry/projects/owner-alpha-beta.json",
    "data/registry/projects/owner-alpha-gamma-preset.json",
  ]);
});

test("rejects a batch collision without mutating any input", () => {
  const manifest = {
    ...base("add-cards"),
    source_fingerprint: fingerprintSourceRecord(source),
    proposed_cards: [
      {
        ...draft("Beta"),
        project_id: "owner-alpha",
      },
    ],
  };
  const current = input(manifest);
  const before = structuredClone(current);
  expect(() => applyProjectOwnerRequest(current)).toThrow(
    /project ID|already exists/iu,
  );
  expect(current).toEqual(before);
});

test("retires and restores one card without touching its siblings", () => {
  const retired = applyProjectOwnerRequest(
    input({
      ...base("retire-card"),
      project_id: project.id,
      project_fingerprint: fingerprintProjectRecord(project),
      original: { listing_status: "active", listing_status_reason: null },
      proposed: {
        listing_status: "retired",
        listing_status_reason: "removed",
      },
    }),
  );
  expect(retired.projects).toEqual([
    expect.objectContaining({
      id: "owner-alpha",
      listing_status: "retired",
      listing_status_reason: "removed",
    }),
  ]);

  const retiredProject = retired.projects[0]!;
  const restored = applyProjectOwnerRequest(
    input(
      {
        ...base("restore-card"),
        project_id: retiredProject.id,
        project_fingerprint: fingerprintProjectRecord(retiredProject),
        original: {
          listing_status: "retired",
          listing_status_reason: "removed",
        },
        proposed: { listing_status: "active", listing_status_reason: null },
      },
      { projects: [retiredProject] },
    ),
  );
  expect(restored.projects[0]).toMatchObject({
    listing_status: "active",
    listing_status_reason: null,
  });
});

test("rejects restoration when the source is permanently delisted", () => {
  const retiredProject = {
    ...project,
    listing_status: "retired",
    listing_status_reason: "removed",
  };
  expect(() =>
    applyProjectOwnerRequest(
      input(
        {
          ...base("restore-card"),
          project_id: retiredProject.id,
          project_fingerprint: fingerprintProjectRecord(retiredProject),
          original: {
            listing_status: "retired",
            listing_status_reason: "removed",
          },
          proposed: { listing_status: "active", listing_status_reason: null },
        },
        {
          projects: [retiredProject],
          source: {
            ...source,
            status: "delisted",
            status_reason: "removed",
            refresh_policy: "paused",
          },
        },
      ),
    ),
  ).toThrow("delisted");
});

test("moves only the source and source-owned snapshot while preserving IDs", () => {
  const result = applyProjectOwnerRequest(
    input(
      {
        ...base("move-source"),
        source_fingerprint: fingerprintSourceRecord(source),
        original: { repository: "Owner/Alpha", repository_id: 42 },
        proposed: {
          repository: "NewOwner/Alpha-Renamed",
          repository_id: 42,
        },
      },
      {
        repository: {
          id: 42,
          fullName: "NewOwner/Alpha-Renamed",
          htmlUrl: "https://github.com/NewOwner/Alpha-Renamed",
          visibility: "public",
          owner: { login: "NewOwner", type: "User" },
        },
      },
    ),
  );

  expect(result.projects).toEqual([]);
  expect(result.source).toEqual({
    ...source,
    repository: "NewOwner/Alpha-Renamed",
  });
  expect(result.snapshot).toMatchObject({
    source_id: "github-42",
    repository: {
      id: 42,
      owner: "NewOwner",
      name: "Alpha-Renamed",
      url: "https://github.com/NewOwner/Alpha-Renamed",
    },
    activity: snapshot.activity,
  });
  expect(result.changedPaths).toEqual([
    "data/registry/sources/github-42.json",
    "data/snapshots/github/github-42.json",
  ]);
});

test("permanently delists only the source tombstone", () => {
  const result = applyProjectOwnerRequest(
    input({
      ...base("delist-source"),
      source_fingerprint: fingerprintSourceRecord(source),
      original: { status: "active" },
      proposed: {
        status: "delisted",
        status_reason: "removed",
        refresh_policy: "paused",
      },
      delist_confirmation: "Owner/Alpha",
    }),
  );

  expect(result.projects).toEqual([]);
  expect(result.source).toEqual({
    ...source,
    status: "delisted",
    status_reason: "removed",
    refresh_policy: "paused",
  });
  expect(result.snapshot).toEqual(snapshot);
  expect(result.changedPaths).toEqual(["data/registry/sources/github-42.json"]);
  expect(result.before).toEqual({ status: "active" });
  expect(result.after).toEqual({
    status: "delisted",
    status_reason: "removed",
    refresh_policy: "paused",
  });
});

test("records trusted staff provenance independently for manual summary and tags", () => {
  const manifest = editManifest();
  manifest.proposed.metadata = {
    summary: { mode: "manual" },
    tags: { mode: "manual" },
  };
  const result = applyProjectOwnerRequest(
    input(manifest, { authorityType: "tavernary-staff" }),
  );

  expect(result.projects[0]).toMatchObject({
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
});

test("rejects manual metadata without verified owner or staff authority", () => {
  expect(() =>
    applyProjectOwnerRequest(
      input(editManifest(), { authorityType: "community-submitter" }),
    ),
  ).toThrow(/manual metadata.*authority/iu);
});

test("rejects a stale tag vocabulary before applying a card mutation", () => {
  try {
    applyProjectOwnerRequest(
      input({
        ...editManifest(),
        tag_vocabulary_hash: "e".repeat(64),
      }),
    );
    throw new Error("expected stale tag vocabulary rejection");
  } catch (error) {
    expect(error).toMatchObject({ code: "tag-vocabulary-stale" });
    expect((error as Error).message).toContain("Rebuild and resubmit");
  }
});

test("rejects stale operation-scoped fingerprints", () => {
  expect(() =>
    applyProjectOwnerRequest(
      input({ ...editManifest(), project_fingerprint: "f".repeat(64) }),
    ),
  ).toThrow("project fingerprint");
  expect(() =>
    applyProjectOwnerRequest(
      input({
        ...base("add-cards"),
        source_fingerprint: "f".repeat(64),
        proposed_cards: [draft("Beta")],
      }),
    ),
  ).toThrow("source fingerprint");
});

test("round-trips changed card records through the JSON formatter", async () => {
  const result = applyProjectOwnerRequest(input(editManifest()));
  const serialized = await formatJson(result.projects[0]);
  expect(JSON.parse(serialized)).toEqual(result.projects[0]);
  expect(serialized).toContain('"tags": ["creative-writing"]');
  expect(serialized.endsWith("\n")).toBe(true);
});
