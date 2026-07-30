import { expect, test } from "vitest";

import {
  normalizeProjectSubmissionManifest,
  serializeProjectSubmissionManifest,
} from "../../src/features/submissions/project-submission-manifest.mjs";

const submissionTags = {
  tags: [
    {
      id: "automate-workflows",
      applicable_kinds: ["extension"],
    },
    {
      id: "creative-writing",
      applicable_kinds: ["extension", "preset"],
    },
  ],
};

function schemaV4Extension(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 4,
    project_type: "extension",
    primary_function: "memory-retrieval",
    source_url: "https://github.com/example/memory",
    frontends: { known_ids: ["sillytavern"], other: [] },
    frontend_independent: false,
    additional_context: null,
    metadata: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
    ...overrides,
  };
}

test("accepts the exact schema-v4 automatic metadata contract", () => {
  expect(
    normalizeProjectSubmissionManifest(schemaV4Extension(), {
      tagVocabulary: submissionTags,
    }),
  ).toEqual({
    valid: true,
    manifest: schemaV4Extension(),
  });
});

test("normalizes independent manual summary and tag requests", () => {
  expect(
    normalizeProjectSubmissionManifest(
      schemaV4Extension({
        metadata: {
          summary: { mode: "manual", value: "  Owner-written summary.  " },
          tags: {
            mode: "manual",
            values: [
              "automate-workflows",
              "creative-writing",
              "creative-writing",
            ],
          },
        },
      }),
      { tagVocabulary: submissionTags },
    ),
  ).toMatchObject({
    valid: true,
    manifest: {
      metadata: {
        summary: { mode: "manual", value: "Owner-written summary." },
        tags: {
          mode: "manual",
          values: ["automate-workflows", "creative-writing"],
        },
      },
    },
  });
});

test("rejects untrusted provenance, unknown tags, and a seventh selection", () => {
  const result = normalizeProjectSubmissionManifest(
    schemaV4Extension({
      metadata: {
        summary: {
          mode: "manual",
          value: "Owner-written summary.",
          note: "Trust me",
        },
        tags: {
          mode: "manual",
          values: [
            "automate-workflows",
            "unknown-tag",
            "tag-3",
            "tag-4",
            "tag-5",
            "tag-6",
            "tag-7",
          ],
        },
      },
    }),
    { tagVocabulary: submissionTags },
  );

  expect(result).toMatchObject({ valid: false });
  if (result.valid) throw new Error("Expected invalid manifest");
  expect(result.errors).toEqual(
    expect.arrayContaining([
      "Submission metadata cannot include provenance notes.",
      "Submission tags must contain no more than six values.",
      "Unknown or inapplicable submission tag: unknown-tag.",
    ]),
  );
});

test("rejects schema-v3 by default but upgrades it for admitted recovery", () => {
  const legacy = {
    schema_version: 3,
    project_type: "extension",
    primary_function: "memory-retrieval",
    source_url: "https://github.com/example/memory",
    name: "Ignored repository name",
    description: "Requested owner summary.",
    frontends: { known_ids: ["sillytavern"], other: [] },
    frontend_independent: false,
    additional_context: null,
  };

  expect(normalizeProjectSubmissionManifest(legacy)).toEqual({
    valid: false,
    errors: [
      "Submission manifest version 3 is retired. Regenerate the request with Tavernary's current project form.",
    ],
  });
  expect(
    normalizeProjectSubmissionManifest(legacy, {
      allowLegacyV3: true,
      tagVocabulary: submissionTags,
    }),
  ).toMatchObject({
    valid: true,
    manifest: {
      schema_version: 4,
      metadata: {
        summary: { mode: "manual", value: "Requested owner summary." },
        tags: { mode: "automatic" },
      },
    },
  });
});

test("accepts an authoritative schema-v4 Extension category", () => {
  expect(
    normalizeProjectSubmissionManifest(schemaV4Extension(), {
      tagVocabulary: submissionTags,
    }),
  ).toMatchObject({
    valid: true,
    manifest: {
      schema_version: 4,
      project_type: "extension",
      primary_function: "memory-retrieval",
    },
  });
});

test.each([
  ["frontend", "interface-workflow"],
  ["preset", "generation-reasoning"],
  ["extension", "frontend"],
  ["extension", "preset"],
  ["extension", "uncategorized"],
  ["extension", ""],
])(
  "rejects schema-v3 %s / %s classification",
  (projectType, primaryFunction) => {
    expect(
      normalizeProjectSubmissionManifest(
        {
          schema_version: 4,
          project_type: projectType,
          primary_function: primaryFunction,
          source_url: "https://github.com/example/project",
          frontends:
            projectType === "extension"
              ? { known_ids: ["sillytavern"], other: [] }
              : { known_ids: [], other: [] },
          frontend_independent: projectType === "preset",
          additional_context: null,
          metadata: {
            summary: { mode: "automatic" },
            tags: { mode: "automatic" },
          },
          ...(projectType === "preset"
            ? {
                preset_compatibility: {
                  model_families: {
                    known_ids: ["model-agnostic"],
                    other: [],
                  },
                  completion_formats: ["chat-completion"],
                },
              }
            : {}),
        },
        { tagVocabulary: submissionTags },
      ),
    ).toMatchObject({ valid: false });
  },
);

test.each([1, 2])(
  "returns legacy schema version %s for human correction",
  (schemaVersion) => {
    expect(
      normalizeProjectSubmissionManifest({
        schema_version: schemaVersion,
        project_type: "extension",
        source_url: "https://github.com/example/project",
        frontends: { known_ids: ["sillytavern"], other: [] },
        frontend_independent: false,
      }),
    ).toEqual({
      valid: false,
      errors: ["Project submission must be updated with a primary function."],
    });
  },
);

test("normalizes a v4 builder manifest without trusting whitespace", () => {
  expect(
    normalizeProjectSubmissionManifest(
      {
        schema_version: 4,
        project_type: "extension",
        primary_function: "interface-workflow",
        source_url: " https://github.com/Owner/Repo ",
        frontends: {
          known_ids: ["sillytavern", "sillytavern"],
          other: [],
        },
        frontend_independent: false,
        additional_context: " ",
        metadata: {
          summary: { mode: "automatic" },
          tags: { mode: "automatic" },
        },
      },
      { tagVocabulary: submissionTags },
    ),
  ).toEqual({
    valid: true,
    manifest: {
      schema_version: 4,
      project_type: "extension",
      primary_function: "interface-workflow",
      source_url: "https://github.com/Owner/Repo",
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
      metadata: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
    },
  });
});

test("accepts a Short Description with exactly 220 normalized characters", () => {
  const description = "x".repeat(220);

  expect(
    normalizeProjectSubmissionManifest(
      {
        schema_version: 4,
        project_type: "frontend",
        primary_function: "frontend",
        source_url: "https://github.com/example/frontend",
        frontends: { known_ids: [], other: [] },
        frontend_independent: false,
        additional_context: null,
        metadata: {
          summary: { mode: "manual", value: `  ${description}  ` },
          tags: { mode: "automatic" },
        },
      },
      { tagVocabulary: submissionTags },
    ),
  ).toMatchObject({
    valid: true,
    manifest: {
      metadata: { summary: { mode: "manual", value: description } },
    },
  });
});

test("rejects a Short Description over 220 normalized characters", () => {
  expect(
    normalizeProjectSubmissionManifest(
      {
        schema_version: 4,
        project_type: "frontend",
        primary_function: "frontend",
        source_url: "https://github.com/example/frontend",
        frontends: { known_ids: [], other: [] },
        frontend_independent: false,
        additional_context: null,
        metadata: {
          summary: { mode: "manual", value: `  ${"x".repeat(221)}  ` },
          tags: { mode: "automatic" },
        },
      },
      { tagVocabulary: submissionTags },
    ),
  ).toEqual({
    valid: false,
    errors: ["Short Description must be 220 characters or fewer."],
  });
});

test("accepts a source-derived external preset without editable display name", () => {
  const result = normalizeProjectSubmissionManifest(
    {
      schema_version: 4,
      project_type: "preset",
      primary_function: "preset",
      source_url: "https://example.com/preset",
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
      metadata: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
      preset_compatibility: {
        model_families: { known_ids: ["model-agnostic"], other: [] },
        completion_formats: ["chat-completion"],
      },
    },
    { tagVocabulary: submissionTags },
  );

  expect(result).toMatchObject({ valid: true });
});

test("requires a GitHub or Codeberg repository for a Frontend", () => {
  const result = normalizeProjectSubmissionManifest(
    {
      schema_version: 4,
      project_type: "frontend",
      primary_function: "frontend",
      source_url: "https://example.com/frontend",
      frontends: { known_ids: [], other: [] },
      frontend_independent: false,
      additional_context: null,
      metadata: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
    },
    { tagVocabulary: submissionTags },
  );

  expect(result).toMatchObject({ valid: false });
  if (result.valid) throw new Error("Expected invalid manifest");
  expect(result.errors).toEqual([
    "Frontends and Extensions require a public GitHub or Codeberg repository.",
  ]);
});

test.each(["frontend", "preset"] as const)(
  "treats a Codeberg %s as repository-backed metadata",
  (projectType) => {
    const result = normalizeProjectSubmissionManifest(
      {
        schema_version: 4,
        project_type: projectType,
        primary_function: projectType,
        source_url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
        frontends: { known_ids: [], other: [] },
        frontend_independent: projectType === "preset",
        additional_context: null,
        metadata: {
          summary: { mode: "automatic" },
          tags: { mode: "automatic" },
        },
        ...(projectType === "preset"
          ? {
              preset_compatibility: {
                model_families: { known_ids: ["model-agnostic"], other: [] },
                completion_formats: ["chat-completion"],
              },
            }
          : {}),
      },
      { tagVocabulary: submissionTags },
    );

    expect(result).toMatchObject({
      valid: true,
      manifest: {
        project_type: projectType,
        source_url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
      },
    });
  },
);

test("serializes the stable submission manifest with a trailing newline", () => {
  expect(
    serializeProjectSubmissionManifest({
      schema_version: 4,
      project_type: "frontend",
      primary_function: "frontend",
      source_url: "https://github.com/Owner/Frontend",
      frontends: { known_ids: [], other: [] },
      frontend_independent: false,
      additional_context: null,
      metadata: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
    }),
  ).toBe(
    '{\n  "schema_version": 4,\n  "project_type": "frontend",\n  "primary_function": "frontend",\n  "source_url": "https://github.com/Owner/Frontend",\n  "frontends": {\n    "known_ids": [],\n    "other": []\n  },\n  "frontend_independent": false,\n  "additional_context": null,\n  "metadata": {\n    "summary": {\n      "mode": "automatic"\n    },\n    "tags": {\n      "mode": "automatic"\n    }\n  }\n}\n',
  );
});

test("limits unlisted model family names to 60 characters", () => {
  const result = normalizeProjectSubmissionManifest(
    {
      schema_version: 4,
      project_type: "preset",
      primary_function: "preset",
      source_url: "https://github.com/Owner/Preset",
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
      metadata: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
      preset_compatibility: {
        model_families: {
          known_ids: [],
          other: ["x".repeat(61)],
        },
        completion_formats: ["chat-completion"],
      },
    },
    { tagVocabulary: submissionTags },
  );

  expect(result).toEqual({
    valid: false,
    errors: ["Unlisted model families must be 60 characters or fewer."],
  });
});

test("preserves Model-Agnostic with recommended and unlisted families", () => {
  expect(
    normalizeProjectSubmissionManifest(
      {
        schema_version: 4,
        project_type: "preset",
        primary_function: "preset",
        source_url: "https://github.com/Owner/Preset",
        frontends: { known_ids: ["sillytavern"], other: [] },
        frontend_independent: false,
        additional_context: null,
        metadata: {
          summary: { mode: "automatic" },
          tags: { mode: "automatic" },
        },
        preset_compatibility: {
          model_families: {
            known_ids: ["model-agnostic", "claude", "model-agnostic"],
            other: ["FutureModel"],
          },
          completion_formats: ["chat-completion"],
        },
      },
      { tagVocabulary: submissionTags },
    ),
  ).toMatchObject({
    valid: true,
    manifest: {
      preset_compatibility: {
        model_families: {
          known_ids: ["model-agnostic", "claude"],
          other: ["FutureModel"],
        },
      },
    },
  });
});
