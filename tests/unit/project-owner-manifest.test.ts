import { describe, expect, test } from "vitest";

import { normalizeProjectOwnerManifest } from "@/features/help/project-owner-manifest.mjs";

const vocabularies = {
  frontends: ["sillytavern", "risuai"],
  primaryFunctions: ["interface-workflow", "generation-reasoning"],
  capabilities: ["automation", "prompt-engineering"],
  modelFamilies: ["claude", "gemini"],
  completionFormats: ["chat-completion", "text-completion"],
};

const originalEdit = {
  kind: "extension",
  name: "Alpha",
  summary: "The original summary.",
  frontends: ["sillytavern"],
  primary_function: "interface-workflow",
  capabilities: ["automation"],
  model_families: [],
  completion_formats: [],
};

function envelope(
  operation: "edit-card" | "move-source" | "delist",
  original: Record<string, unknown>,
  proposed: Record<string, unknown>,
) {
  return {
    schema_version: 1,
    request_kind: "project-owner",
    operation,
    project_id: "owner-alpha",
    repository_id: 42,
    source_fingerprint: "a".repeat(64),
    original,
    proposed,
    explanation: null,
  };
}

function editFixture(proposed: Record<string, unknown> = {}) {
  return envelope("edit-card", originalEdit, {
    name: "Alpha Updated",
    summary: "A concise owner summary.",
    frontends: ["sillytavern"],
    primary_function: "interface-workflow",
    capabilities: ["automation"],
    model_families: [],
    completion_formats: [],
    ...proposed,
  });
}

describe("owner card edits", () => {
  test("requires the optional explanation member to be explicit", () => {
    const { explanation: _explanation, ...missingExplanation } = editFixture();

    expect(
      normalizeProjectOwnerManifest(missingExplanation, vocabularies),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Owner request explanation member is required.",
      ]),
    });
  });

  test("normalizes all editable values and optional explanation", () => {
    expect(
      normalizeProjectOwnerManifest(
        {
          ...editFixture({
            name: " Alpha Updated ",
            summary: "A concise owner summary.\nWith another detail.",
            frontends: [" sillytavern ", "sillytavern"],
            capabilities: [" automation ", "automation"],
          }),
          explanation: " Public documentation confirms this. ",
        },
        vocabularies,
      ),
    ).toEqual({
      valid: true,
      manifest: {
        ...editFixture({
          summary: "A concise owner summary. With another detail.",
        }),
        explanation: "Public documentation confirms this.",
      },
    });
  });

  test("normalizes owner summary line breaks without model word rules", () => {
    const result = normalizeProjectOwnerManifest(
      editFixture({
        summary: "A concise owner summary.\nWith another detail.",
      }),
      vocabularies,
    );
    expect(result).toMatchObject({
      valid: true,
      manifest: {
        proposed: {
          summary: "A concise owner summary. With another detail.",
        },
      },
    });
  });

  test("rejects owner summaries beyond 220 characters", () => {
    expect(
      normalizeProjectOwnerManifest(
        editFixture({ summary: "x".repeat(221) }),
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Owner summary must be 220 characters or fewer.",
      ]),
    });
  });

  test("enforces the owner-only name limit and single-line plain text", () => {
    for (const name of ["x".repeat(101), "Alpha\nBeta", "Alpha\u0000Beta"]) {
      expect(
        normalizeProjectOwnerManifest(editFixture({ name }), vocabularies),
      ).toMatchObject({ valid: false });
    }
    expect(
      normalizeProjectOwnerManifest(
        editFixture({ name: "x".repeat(101) }),
        vocabularies,
      ),
    ).toMatchObject({
      errors: expect.arrayContaining([
        "Owner display name must be 100 characters or fewer.",
      ]),
    });
  });

  test("rejects unknown controlled metadata", () => {
    const cases = [
      ["frontends", ["unknown-frontend"]],
      ["primary_function", "unknown-function"],
      ["capabilities", ["unknown-capability"]],
    ] as const;
    for (const [field, value] of cases) {
      expect(
        normalizeProjectOwnerManifest(
          editFixture({ [field]: value }),
          vocabularies,
        ),
      ).toMatchObject({ valid: false });
    }
  });

  test("allows preset compatibility only for presets and validates its vocabularies", () => {
    const presetOriginal = {
      ...originalEdit,
      kind: "preset",
      model_families: ["claude"],
      completion_formats: ["chat-completion"],
    };
    const preset = {
      ...editFixture().proposed,
      model_families: ["gemini"],
      completion_formats: ["text-completion"],
    };
    expect(
      normalizeProjectOwnerManifest(
        envelope("edit-card", presetOriginal, preset),
        vocabularies,
      ),
    ).toMatchObject({ valid: true });
    expect(
      normalizeProjectOwnerManifest(
        envelope("edit-card", presetOriginal, {
          ...preset,
          model_families: ["unknown-family"],
        }),
        vocabularies,
      ),
    ).toMatchObject({ valid: false });
    expect(
      normalizeProjectOwnerManifest(
        editFixture({ model_families: ["claude"] }),
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Only Presets can change model compatibility.",
      ]),
    });
  });

  test("rejects unchanged card edits", () => {
    expect(
      normalizeProjectOwnerManifest(
        envelope("edit-card", originalEdit, {
          name: originalEdit.name,
          summary: originalEdit.summary,
          frontends: originalEdit.frontends,
          primary_function: originalEdit.primary_function,
          capabilities: originalEdit.capabilities,
          model_families: originalEdit.model_families,
          completion_formats: originalEdit.completion_formats,
        }),
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Owner card edit must change at least one field.",
      ]),
    });
  });
});

describe("owner source moves and delisting", () => {
  test("accepts a renamed repository only when immutable IDs stay equal", () => {
    expect(
      normalizeProjectOwnerManifest(
        envelope(
          "move-source",
          { repository: "Owner/Alpha", repository_id: 42 },
          { repository: "Owner/Alpha-Renamed", repository_id: 42 },
        ),
        vocabularies,
      ),
    ).toMatchObject({ valid: true });
    expect(
      normalizeProjectOwnerManifest(
        envelope(
          "move-source",
          { repository: "Owner/Alpha", repository_id: 42 },
          { repository: "Other/Replacement", repository_id: 99 },
        ),
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Repository location changes must retain the immutable repository ID.",
      ]),
    });
  });

  test("rejects malformed or unchanged repository locations", () => {
    for (const repository of [
      "https://github.com/Owner/Alpha-Renamed",
      "Owner",
      "Owner/Alpha/Other",
      "Owner/Alpha",
    ]) {
      expect(
        normalizeProjectOwnerManifest(
          envelope(
            "move-source",
            { repository: "Owner/Alpha", repository_id: 42 },
            { repository, repository_id: 42 },
          ),
          vocabularies,
        ),
      ).toMatchObject({ valid: false });
    }
  });

  test("accepts only the explicit delisting tombstone", () => {
    const original = { visibility: "published" };
    const proposed = {
      visibility: "disabled",
      visibility_reason: "removed",
      refresh_policy: "paused",
      enrichment_policy: "manual",
    };
    const result = normalizeProjectOwnerManifest(
      envelope("delist", original, proposed),
      vocabularies,
    );
    expect(result).toMatchObject({ valid: true });
    if (result.valid) expect(result.manifest.original).toEqual(original);
    expect(
      normalizeProjectOwnerManifest(
        envelope("delist", original, {
          ...proposed,
          visibility: "published",
        }),
        vocabularies,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(["Owner delisting effect is invalid."]),
    });
  });
});

test("rejects malformed envelopes and unknown fields", () => {
  expect(
    normalizeProjectOwnerManifest(
      { ...editFixture(), repository_id: 0, injected: true },
      vocabularies,
    ),
  ).toMatchObject({
    valid: false,
    errors: expect.arrayContaining([
      "Owner request contains unknown properties.",
      "Owner request repository ID must be a positive integer.",
    ]),
  });
});
