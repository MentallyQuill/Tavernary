import { expect, test } from "vitest";

import { formatJson } from "../../scripts/catalog/json-format.mjs";
import { applyProjectOwnerRequest } from "../../scripts/help/apply-project-owner-request.mjs";
import { fingerprintProjectRecord } from "../../src/features/help/project-owner-record.mjs";

const vocabularies = {
  frontends: ["sillytavern", "risuai"],
  primaryFunctions: [
    "frontend",
    "preset",
    "interface-workflow",
    "generation-reasoning",
  ],
  capabilities: ["automation", "prompt-engineering"],
  modelFamilies: ["claude", "gemini"],
  completionFormats: ["chat-completion", "text-completion"],
};

function registryRecord(record: Record<string, unknown> = {}) {
  return {
    schema_version: 5,
    id: "owner-alpha",
    name: "Alpha",
    kind: "extension",
    summary: "The original summary.",
    metadata_status: "provisional",
    source: {
      type: "github",
      repository: "Owner/Alpha",
      repository_id: 42,
    },
    frontends: ["sillytavern"],
    primary_function: "interface-workflow",
    capabilities: ["automation"],
    cataloged_at: "2026-07-23T00:00:00.000Z",
    catalog_cohort: "seed",
    visibility: "published",
    visibility_reason: null,
    refresh_policy: "automatic",
    enrichment_policy: "automatic",
    ...record,
  };
}

function repositorySnapshot(snapshot: Record<string, unknown> = {}) {
  return {
    schema_version: 3,
    provider: "github",
    project_id: "owner-alpha",
    repository: {
      id: 42,
      owner: "Owner",
      name: "Alpha",
      url: "https://github.com/Owner/Alpha",
      description: "Original repository description.",
      default_branch: "main",
      head_sha: "a".repeat(40),
      head_committed_at: "2026-07-23T12:00:00.000Z",
      archived: false,
      fork: false,
      parent: null,
      created_at: "2026-01-01T00:00:00.000Z",
      size_kb: 10,
    },
    source_health: "healthy",
    activity: { marker: "history stays" },
    community: { aggregate: 7 },
    license: { status: "missing", spdx_id: null, source_path: null },
    refreshed_at: "2026-07-23T12:00:00.000Z",
    stale_since: null,
    ...snapshot,
  };
}

function editManifest(
  record: ReturnType<typeof registryRecord>,
  proposed: Record<string, unknown> = {},
) {
  return {
    schema_version: 1,
    request_kind: "project-owner",
    operation: "edit-card",
    project_id: record.id,
    repository_id: 42,
    source_fingerprint: fingerprintProjectRecord(record),
    original: {
      kind: record.kind,
      name: record.name,
      summary: record.summary,
      frontends: record.frontends,
      primary_function: record.primary_function,
      capabilities: record.capabilities,
      model_families:
        "model_families" in record && Array.isArray(record.model_families)
          ? [...record.model_families]
          : ([] as string[]),
      completion_formats:
        "completion_formats" in record &&
        Array.isArray(record.completion_formats)
          ? [...record.completion_formats]
          : ([] as string[]),
    },
    proposed: {
      name: "Alpha",
      summary: "Owner-authored summary.",
      frontends: ["sillytavern"],
      primary_function: "interface-workflow",
      capabilities: ["automation"],
      model_families: [] as string[],
      completion_formats: [] as string[],
      ...proposed,
    },
    explanation: null,
  };
}

function editMutationFixture(proposed: Record<string, unknown> = {}) {
  const record = registryRecord();
  return {
    issueNumber: 123,
    manifest: editManifest(record, proposed),
    record,
    snapshot: repositorySnapshot(),
    vocabularies,
  };
}

test("protects an approved owner card edit from enrichment", () => {
  const input = editMutationFixture({
    summary: "  Owner-authored\n  summary.  ",
    frontends: ["sillytavern", "risuai"],
    primary_function: "generation-reasoning",
    capabilities: ["prompt-engineering"],
  });
  const beforeRecord = structuredClone(input.record);
  const beforeSnapshot = structuredClone(input.snapshot);

  const result = applyProjectOwnerRequest(input);

  expect(result.record).toMatchObject({
    name: "Alpha",
    summary: "Owner-authored summary.",
    metadata_status: "curated",
    frontends: ["sillytavern", "risuai"],
    primary_function: "generation-reasoning",
    capabilities: ["prompt-engineering"],
    refresh_policy: "automatic",
    enrichment_policy: "manual",
    enrichment_note:
      "Owner-authored catalog details approved through issue #123.",
  });
  expect(result.record.source).toEqual(beforeRecord.source);
  expect(result.snapshot).toEqual(beforeSnapshot);
  expect(result.changedPaths).toEqual([
    "data/registry/projects/owner-alpha.json",
  ]);
  expect(result.before).toMatchObject({
    summary: "The original summary.",
    enrichment_policy: "automatic",
  });
  expect(result.after).toMatchObject({
    summary: "Owner-authored summary.",
    enrichment_policy: "manual",
  });
  expect(input.record).toEqual(beforeRecord);
  expect(input.snapshot).toEqual(beforeSnapshot);
  expect(result.record).not.toHaveProperty("owner_request");
  expect(result.record).not.toHaveProperty("issue_number");
  expect(result.record).not.toHaveProperty("provenance");
});

test("applies the validated published summary instead of raw proposed copy", () => {
  const result = applyProjectOwnerRequest({
    ...editMutationFixture({
      summary: "Owner-authored summary",
    }),
    publishedSummary: "Owner-authored summary.",
  });

  expect(result.record).toMatchObject({
    summary: "Owner-authored summary.",
    metadata_status: "curated",
    enrichment_policy: "manual",
  });
  expect(result.after.summary).toBe("Owner-authored summary.");
});

test("preserves enrichment authority for classification-only edits", () => {
  const result = applyProjectOwnerRequest(
    editMutationFixture({
      summary: "The original summary.",
      primary_function: "generation-reasoning",
    }),
  );

  expect(result.record).toMatchObject({
    metadata_status: "provisional",
    primary_function: "generation-reasoning",
    enrichment_policy: "automatic",
  });
  expect(result.record).not.toHaveProperty("enrichment_note");
});

test("changes enrichment to manual only for summary or capability edits", () => {
  for (const proposed of [
    { summary: "A deliberately owner-authored summary." },
    {
      summary: "The original summary.",
      capabilities: ["prompt-engineering"],
    },
  ]) {
    expect(
      applyProjectOwnerRequest(editMutationFixture(proposed)).record,
    ).toMatchObject({
      metadata_status: "curated",
      enrichment_policy: "manual",
      enrichment_note:
        "Owner-authored catalog details approved through issue #123.",
    });
  }
});

test("applies a trusted staff card edit without repository identity", () => {
  const current = registryRecord({
    source: { type: "url", url: "https://example.com/alpha" },
  });
  const manifest = {
    ...editManifest(current, { name: "Alpha Staff Edit" }),
    repository_id: null,
  };

  expect(
    applyProjectOwnerRequest({
      issueNumber: 123,
      manifest,
      record: current,
      snapshot: null,
      vocabularies,
    }).record,
  ).toMatchObject({
    name: "Alpha Staff Edit",
    source: { type: "url", url: "https://example.com/alpha" },
  });
});

test("preserves concurrent changes outside the owner-requested fields", () => {
  const original = registryRecord();
  const input = {
    issueNumber: 123,
    manifest: editManifest(original),
    record: registryRecord({
      name: "Maintainer-renamed Alpha",
      catalog_cohort: "standard",
    }),
    snapshot: repositorySnapshot(),
    vocabularies,
  };

  const result = applyProjectOwnerRequest(input);

  expect(result.record).toMatchObject({
    name: "Maintainer-renamed Alpha",
    summary: "Owner-authored summary.",
    catalog_cohort: "standard",
  });
});

test("enforces the owner display-name boundary again when applying", () => {
  expect(() =>
    applyProjectOwnerRequest(editMutationFixture({ name: "x".repeat(101) })),
  ).toThrow("Owner display name must be 100 characters or fewer.");
});

test("applies Preset compatibility fields with the same approved field parity", () => {
  const record = registryRecord({
    kind: "preset",
    primary_function: "preset",
    model_families: ["claude"],
    completion_formats: ["chat-completion"],
  });
  const manifest = editManifest(record, {
    primary_function: "preset",
    model_families: ["gemini"],
    completion_formats: ["text-completion"],
  });
  manifest.original.model_families = ["claude"];
  manifest.original.completion_formats = ["chat-completion"];

  const result = applyProjectOwnerRequest({
    issueNumber: 124,
    manifest,
    record,
    snapshot: repositorySnapshot(),
    vocabularies,
  });

  expect(result.record).toMatchObject({
    kind: "preset",
    model_families: ["gemini"],
    completion_formats: ["text-completion"],
  });
});

test("moves only the current location of the same immutable repository", () => {
  const record = registryRecord();
  const snapshot = repositorySnapshot();
  const manifest = {
    schema_version: 1,
    request_kind: "project-owner",
    operation: "move-source",
    project_id: "owner-alpha",
    repository_id: 42,
    source_fingerprint: fingerprintProjectRecord(record),
    original: { repository: "Owner/Alpha", repository_id: 42 },
    proposed: { repository: "NewOwner/Alpha-Renamed", repository_id: 42 },
    explanation: null,
  };
  const result = applyProjectOwnerRequest({
    issueNumber: 125,
    manifest,
    record,
    snapshot,
    repository: {
      id: 42,
      fullName: "NewOwner/Alpha-Renamed",
      htmlUrl: "https://github.com/NewOwner/Alpha-Renamed",
      visibility: "public",
      owner: { login: "NewOwner", type: "User" },
    },
    vocabularies,
  });

  expect(result.record.source).toEqual({
    type: "github",
    repository: "NewOwner/Alpha-Renamed",
    repository_id: 42,
  });
  expect(result.snapshot).toEqual({
    ...snapshot,
    repository: {
      ...snapshot.repository,
      owner: "NewOwner",
      name: "Alpha-Renamed",
      url: "https://github.com/NewOwner/Alpha-Renamed",
    },
  });
  expect(result.snapshot?.activity).toEqual(snapshot.activity);
  expect(result.changedPaths).toEqual([
    "data/registry/projects/owner-alpha.json",
    "data/snapshots/github/owner-alpha.json",
  ]);
  expect(result.before).toEqual({
    repository: "Owner/Alpha",
    repository_id: 42,
  });
  expect(result.after).toEqual({
    repository: "NewOwner/Alpha-Renamed",
    repository_id: 42,
  });
});

test.each([
  ["owner", { owner: "Wrong" }],
  ["name", { name: "Stale" }],
  ["URL", { url: "https://github.com/Wrong/Stale" }],
])(
  "rejects a source move when the current snapshot %s is stale",
  (_field, repositoryPatch) => {
    const record = registryRecord();
    const snapshot = repositorySnapshot({
      repository: {
        ...repositorySnapshot().repository,
        ...repositoryPatch,
      },
    });
    const manifest = {
      schema_version: 1,
      request_kind: "project-owner",
      operation: "move-source",
      project_id: "owner-alpha",
      repository_id: 42,
      source_fingerprint: fingerprintProjectRecord(record),
      original: { repository: "Owner/Alpha", repository_id: 42 },
      proposed: { repository: "NewOwner/Alpha-Renamed", repository_id: 42 },
      explanation: null,
    };

    expect(() =>
      applyProjectOwnerRequest({
        issueNumber: 125,
        manifest,
        record,
        snapshot,
        repository: {
          id: 42,
          fullName: "NewOwner/Alpha-Renamed",
          htmlUrl: "https://github.com/NewOwner/Alpha-Renamed",
          visibility: "public",
          owner: { login: "NewOwner", type: "User" },
        },
        vocabularies,
      }),
    ).toThrow("snapshot location");
  },
);

test("rejects a source move to a different immutable repository ID", () => {
  const record = registryRecord();
  const manifest = {
    schema_version: 1,
    request_kind: "project-owner",
    operation: "move-source",
    project_id: "owner-alpha",
    repository_id: 42,
    source_fingerprint: fingerprintProjectRecord(record),
    original: { repository: "Owner/Alpha", repository_id: 42 },
    proposed: { repository: "Other/Replacement", repository_id: 42 },
    explanation: null,
  };

  expect(() =>
    applyProjectOwnerRequest({
      issueNumber: 126,
      manifest,
      record,
      snapshot: repositorySnapshot(),
      repository: {
        id: 99,
        fullName: "Other/Replacement",
        htmlUrl: "https://github.com/Other/Replacement",
        visibility: "public",
        owner: { login: "Other", type: "User" },
      },
      vocabularies,
    }),
  ).toThrow("immutable repository ID");
});

test("retains a delisted record and snapshot as an explicit tombstone", () => {
  const record = registryRecord();
  const snapshot = repositorySnapshot();
  const result = applyProjectOwnerRequest({
    issueNumber: 127,
    manifest: {
      schema_version: 1,
      request_kind: "project-owner",
      operation: "delist",
      project_id: "owner-alpha",
      repository_id: 42,
      source_fingerprint: fingerprintProjectRecord(record),
      delist_confirmation: "Alpha",
      original: { visibility: "published" },
      proposed: {
        visibility: "disabled",
        visibility_reason: "removed",
        refresh_policy: "paused",
        enrichment_policy: "manual",
      },
      explanation: "Please remove this listing.",
    },
    record,
    snapshot,
    vocabularies,
  });

  expect(result.record).toEqual({
    ...record,
    visibility: "disabled",
    visibility_reason: "removed",
    refresh_policy: "paused",
    enrichment_policy: "manual",
    enrichment_note: "Owner-requested delisting approved through issue #127.",
  });
  expect(result.snapshot).toEqual(snapshot);
  expect(result.changedPaths).toEqual([
    "data/registry/projects/owner-alpha.json",
  ]);
});

test("revalidates typed delist confirmation against the current name", () => {
  const record = registryRecord();
  const manifest = {
    schema_version: 1,
    request_kind: "project-owner",
    operation: "delist",
    project_id: "owner-alpha",
    repository_id: 42,
    source_fingerprint: fingerprintProjectRecord(record),
    delist_confirmation: "  aLpHa  ",
    original: { visibility: "published" },
    proposed: {
      visibility: "disabled",
      visibility_reason: "removed",
      refresh_policy: "paused",
      enrichment_policy: "manual",
    },
    explanation: null,
  };

  expect(() =>
    applyProjectOwnerRequest({
      issueNumber: 128,
      manifest,
      record,
      snapshot: repositorySnapshot(),
      vocabularies,
    }),
  ).not.toThrow();

  expect(() =>
    applyProjectOwnerRequest({
      issueNumber: 128,
      manifest: { ...manifest, delist_confirmation: "Al" },
      record,
      snapshot: repositorySnapshot(),
      vocabularies,
    }),
  ).toThrow(
    "Owner delisting confirmation must match the current complete project name.",
  );

  expect(() =>
    applyProjectOwnerRequest({
      issueNumber: 128,
      manifest,
      record: registryRecord({ name: "Alpha Renamed" }),
      snapshot: repositorySnapshot(),
      vocabularies,
    }),
  ).toThrow(
    "Owner delisting confirmation must match the current complete project name.",
  );
});

test("rejects no-op requests and overlapping current-record changes", () => {
  const noOp = editMutationFixture();
  noOp.manifest.proposed = {
    name: noOp.manifest.original.name,
    summary: noOp.manifest.original.summary,
    frontends: noOp.manifest.original.frontends,
    primary_function: noOp.manifest.original.primary_function,
    capabilities: noOp.manifest.original.capabilities,
    model_families: noOp.manifest.original.model_families,
    completion_formats: noOp.manifest.original.completion_formats,
  };
  expect(() => applyProjectOwnerRequest(noOp)).toThrow(
    "Owner card edit must change at least one field.",
  );

  const stale = editMutationFixture();
  stale.record.summary = "A concurrent maintainer summary.";
  expect(() => applyProjectOwnerRequest(stale)).toThrow("stale-owner-request");
});

test("round-trips mutation results through the repository JSON formatter", async () => {
  const result = applyProjectOwnerRequest(editMutationFixture());
  const serialized = await formatJson(result.record);

  expect(JSON.parse(serialized)).toEqual(result.record);
  expect(serialized).toContain('"frontends": ["sillytavern"]');
  expect(serialized).toContain('"capabilities": ["automation"]');
  expect(serialized.endsWith("\n")).toBe(true);
});
