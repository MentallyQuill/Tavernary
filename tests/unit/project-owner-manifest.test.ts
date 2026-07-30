import { describe, expect, test } from "vitest";

import { normalizeProjectOwnerManifest } from "@/features/help/project-owner-manifest.mjs";

const currentTagVocabularyHash = "f".repeat(64);
const vocabularies = {
  frontends: ["sillytavern", "risuai"],
  primaryFunctions: [
    "frontend",
    "preset",
    "interface-workflow",
    "generation-reasoning",
  ],
  modelFamilies: ["claude", "gemini"],
  completionFormats: ["chat-completion", "text-completion"],
  tagVocabularyHash: currentTagVocabularyHash,
  tags: [
    {
      id: "automate-workflows",
      applicable_kinds: ["frontend", "extension"],
    },
    {
      id: "creative-writing",
      applicable_kinds: ["frontend", "extension", "preset"],
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `trait-${index + 1}`,
      applicable_kinds: ["extension"],
    })),
  ],
  source: {
    id: "github-42",
    type: "github" as const,
    repository: "Owner/Alpha",
    repository_id: 42,
  },
};

const automaticMetadata = {
  summary: { mode: "automatic" as const },
  tags: { mode: "automatic" as const },
};

const originalEdit = {
  kind: "extension" as const,
  name: "Alpha",
  summary: "The original summary.",
  frontends: ["sillytavern"],
  primary_function: "interface-workflow",
  tags: ["automate-workflows"],
  metadata: automaticMetadata,
  model_families: [],
  completion_formats: [],
};

const proposedEdit = {
  name: "Alpha Updated",
  summary: "A concise owner summary.",
  frontends: ["sillytavern"],
  primary_function: "interface-workflow",
  tags: ["automate-workflows"],
  metadata: automaticMetadata,
  model_families: [],
  completion_formats: [],
};

const validDraft = {
  draft_id: "draft-1",
  project_id: "owner-alpha-v9-mirage",
  name: "V9 Mirage",
  kind: "preset" as const,
  summary: "A distinct preset from the same repository.",
  frontends: ["sillytavern"],
  primary_function: "preset",
  tags: ["creative-writing"],
  metadata: automaticMetadata,
  model_families: ["claude"],
  completion_formats: ["chat-completion"],
};

function base(operation: string) {
  return {
    schema_version: 2,
    request_kind: "project-owner",
    operation,
    source_id: "github-42",
    repository_id: 42,
    explanation: null,
  };
}

function editFixture(proposed: Record<string, unknown> = {}) {
  return {
    ...base("edit-card"),
    tag_vocabulary_hash: currentTagVocabularyHash,
    project_id: "owner-alpha",
    project_fingerprint: "b".repeat(64),
    original: originalEdit,
    proposed: { ...proposedEdit, ...proposed },
  };
}

function addFixture(cards: object[] = [validDraft]) {
  return {
    ...base("add-cards"),
    tag_vocabulary_hash: currentTagVocabularyHash,
    source_fingerprint: "a".repeat(64),
    proposed_cards: cards,
  };
}

function sourceFixture(operation: "move-source" | "delist-source") {
  return {
    ...base(operation),
    source_fingerprint: "a".repeat(64),
    ...(operation === "move-source"
      ? {
          original: { repository: "Owner/Alpha", repository_id: 42 },
          proposed: { repository: "Owner/Alpha-Renamed", repository_id: 42 },
        }
      : {
          original: { status: "active" },
          proposed: {
            status: "delisted",
            status_reason: "removed",
            refresh_policy: "paused",
          },
          delist_confirmation: "Owner/Alpha",
        }),
  };
}

describe("owner add-card batches", () => {
  test("normalizes a schema-v2 multi-card request", () => {
    expect(
      normalizeProjectOwnerManifest(addFixture(), vocabularies),
    ).toMatchObject({
      valid: true,
      manifest: {
        operation: "add-cards",
        proposed_cards: [validDraft],
      },
    });
  });

  test("rejects a request created against a different tracked tag vocabulary", () => {
    expect(
      normalizeProjectOwnerManifest(
        {
          ...addFixture(),
          tag_vocabulary_hash: "e".repeat(64),
        },
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Owner request tag vocabulary is stale. Rebuild and resubmit the request.",
      ]),
    });
  });

  test("accepts one to ten complete drafts", () => {
    const cards = Array.from({ length: 10 }, (_, index) => {
      const number = index + 1;
      return {
        ...validDraft,
        draft_id: `draft-${number}`,
        project_id: `owner-alpha-variant-${number}`,
        name: `Variant ${number}`,
      };
    });
    expect(
      normalizeProjectOwnerManifest(addFixture(cards), vocabularies),
    ).toMatchObject({ valid: true });
    for (const invalid of [[], [...cards, { ...validDraft, draft_id: "11" }]]) {
      expect(
        normalizeProjectOwnerManifest(addFixture(invalid), vocabularies),
      ).toMatchObject({
        valid: false,
        errors: expect.arrayContaining([
          "Owner add-card request must contain one to ten cards.",
        ]),
      });
    }
  });

  test.each([
    [
      "draft IDs",
      [
        validDraft,
        {
          ...validDraft,
          project_id: "owner-alpha-another",
          name: "Another",
        },
      ],
    ],
    [
      "project IDs",
      [
        validDraft,
        {
          ...validDraft,
          draft_id: "draft-2",
          name: "Another",
        },
      ],
    ],
    [
      "normalized titles",
      [
        validDraft,
        {
          ...validDraft,
          draft_id: "draft-2",
          project_id: "owner-alpha-v9-mirage",
          name: "  V9   Mirage ",
        },
      ],
    ],
  ])("rejects duplicate %s", (label, cards) => {
    expect(
      normalizeProjectOwnerManifest(addFixture(cards), vocabularies),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        `Owner add-card request contains duplicate ${label}.`,
      ]),
    });
  });

  test("requires project IDs derived from the source and title", () => {
    expect(
      normalizeProjectOwnerManifest(
        addFixture([{ ...validDraft, project_id: "unrelated-id" }]),
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Owner card draft 1 project ID does not match its source and title.",
      ]),
    });
  });

  test("enforces six applicable controlled tags per draft", () => {
    expect(
      normalizeProjectOwnerManifest(
        addFixture([
          {
            ...validDraft,
            kind: "extension",
            primary_function: "interface-workflow",
            model_families: [],
            completion_formats: [],
            tags: Array.from({ length: 7 }, (_, index) =>
              index === 6 ? "creative-writing" : `trait-${index + 1}`,
            ),
          },
        ]),
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(["Owner tags are invalid or exceed six."]),
    });
    expect(
      normalizeProjectOwnerManifest(
        addFixture([{ ...validDraft, tags: ["automate-workflows"] }]),
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Owner tag automate-workflows does not apply to preset cards.",
      ]),
    });
  });

  test("accepts only independent mode choices and no provenance notes", () => {
    expect(
      normalizeProjectOwnerManifest(
        addFixture([
          {
            ...validDraft,
            metadata: {
              summary: { mode: "manual" },
              tags: { mode: "automatic" },
            },
          },
        ]),
        vocabularies,
      ),
    ).toMatchObject({ valid: true });
    expect(
      normalizeProjectOwnerManifest(
        addFixture([
          {
            ...validDraft,
            metadata: {
              summary: { mode: "manual", note: "claimed provenance" },
              tags: { mode: "automatic" },
            },
          },
        ]),
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Owner summary metadata choice is invalid.",
      ]),
    });
  });
});

describe("owner card edits and lifecycle", () => {
  test("normalizes complete editable values and explanation", () => {
    const result = normalizeProjectOwnerManifest(
      {
        ...editFixture({
          name: " Alpha Updated ",
          summary: "A concise owner summary.\nWith another detail.",
          frontends: [" sillytavern "],
        }),
        explanation: " Public documentation confirms this. ",
      },
      vocabularies,
    );
    expect(result).toMatchObject({
      valid: true,
      manifest: {
        operation: "edit-card",
        project_fingerprint: "b".repeat(64),
        proposed: {
          name: "Alpha Updated",
          summary: "A concise owner summary. With another detail.",
        },
        explanation: "Public documentation confirms this.",
      },
    });
  });

  test("keeps kind fixed and rejects unchanged edits", () => {
    expect(
      normalizeProjectOwnerManifest(
        editFixture({ kind: "preset" }),
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Owner card values contain unknown or missing properties.",
      ]),
    });
    const { kind: _kind, ...unchanged } = originalEdit;
    expect(
      normalizeProjectOwnerManifest(editFixture(unchanged), vocabularies),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Owner card edit must change at least one field.",
      ]),
    });
  });

  test("enforces structural primary functions and Preset compatibility", () => {
    expect(
      normalizeProjectOwnerManifest(
        editFixture({ primary_function: "preset" }),
        vocabularies,
      ),
    ).toMatchObject({ valid: false });
    const preset = {
      ...originalEdit,
      kind: "preset" as const,
      primary_function: "preset",
      tags: ["creative-writing"],
      model_families: ["claude"],
      completion_formats: ["chat-completion"],
    };
    expect(
      normalizeProjectOwnerManifest(
        {
          ...editFixture(),
          original: preset,
          proposed: {
            ...proposedEdit,
            primary_function: "preset",
            tags: ["creative-writing"],
            model_families: ["gemini"],
            completion_formats: ["text-completion"],
          },
        },
        vocabularies,
      ),
    ).toMatchObject({ valid: true });
  });

  test.each([
    [
      "retire-card",
      { listing_status: "active", listing_status_reason: null },
      { listing_status: "retired", listing_status_reason: "owner-request" },
    ],
    [
      "restore-card",
      { listing_status: "retired", listing_status_reason: "owner-request" },
      { listing_status: "active", listing_status_reason: null },
    ],
  ] as const)(
    "accepts only the exact %s transition",
    (operation, original, proposed) => {
      const candidate = {
        ...base(operation),
        project_id: "owner-alpha",
        project_fingerprint: "b".repeat(64),
        original,
        proposed,
      };
      expect(
        normalizeProjectOwnerManifest(candidate, vocabularies),
      ).toMatchObject({ valid: true });
      expect(
        normalizeProjectOwnerManifest(
          { ...candidate, proposed: original },
          vocabularies,
        ),
      ).toMatchObject({ valid: false });
    },
  );
});

describe("owner source maintenance", () => {
  test("moves a source only when the immutable repository ID is retained", () => {
    expect(
      normalizeProjectOwnerManifest(sourceFixture("move-source"), vocabularies),
    ).toMatchObject({ valid: true });
    expect(
      normalizeProjectOwnerManifest(
        {
          ...sourceFixture("move-source"),
          proposed: {
            repository: "Other/Replacement",
            repository_id: 99,
          },
        },
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Repository location changes must retain the immutable repository ID.",
      ]),
    });
  });

  test("requires an exact repository confirmation for permanent delisting", () => {
    expect(
      normalizeProjectOwnerManifest(
        sourceFixture("delist-source"),
        vocabularies,
      ),
    ).toMatchObject({
      valid: true,
      manifest: {
        operation: "delist-source",
        proposed: {
          status: "delisted",
          status_reason: "removed",
          refresh_policy: "paused",
        },
      },
    });
    expect(
      normalizeProjectOwnerManifest(
        {
          ...sourceFixture("delist-source"),
          delist_confirmation: "Alpha",
        },
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Owner source delisting confirmation must match the repository.",
      ]),
    });
  });
});

test("rejects v1, malformed envelopes, and the wrong fingerprint scope", () => {
  expect(
    normalizeProjectOwnerManifest(
      {
        ...editFixture(),
        schema_version: 1,
        source_fingerprint: "a".repeat(64),
        injected: true,
      },
      vocabularies,
    ),
  ).toMatchObject({
    valid: false,
    errors: expect.arrayContaining([
      "Owner request must use schema version 2.",
      "Owner request contains unknown or missing properties.",
    ]),
  });
});
