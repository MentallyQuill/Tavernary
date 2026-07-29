import { expect, test } from "vitest";

import {
  normalizeProjectSubmissionManifest,
  serializeProjectSubmissionManifest,
} from "../../src/features/submissions/project-submission-manifest.mjs";

test("accepts an authoritative schema-v3 Extension category", () => {
  expect(
    normalizeProjectSubmissionManifest({
      schema_version: 3,
      project_type: "extension",
      primary_function: "memory-retrieval",
      source_url: "https://github.com/example/memory",
      name: null,
      description: null,
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
    }),
  ).toMatchObject({
    valid: true,
    manifest: {
      schema_version: 3,
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
      normalizeProjectSubmissionManifest({
        schema_version: 3,
        project_type: projectType,
        primary_function: primaryFunction,
        source_url: "https://github.com/example/project",
        name: null,
        description: null,
        frontends:
          projectType === "extension"
            ? { known_ids: ["sillytavern"], other: [] }
            : { known_ids: [], other: [] },
        frontend_independent: projectType === "preset",
        additional_context: null,
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
      }),
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

test("normalizes a builder manifest without trusting whitespace", () => {
  expect(
    normalizeProjectSubmissionManifest({
      schema_version: 3,
      project_type: "extension",
      primary_function: "interface-workflow",
      source_url: " https://github.com/Owner/Repo ",
      name: " Example ",
      description: "",
      frontends: {
        known_ids: ["sillytavern", "sillytavern"],
        other: [],
      },
      frontend_independent: false,
      additional_context: " ",
    }),
  ).toEqual({
    valid: true,
    manifest: {
      schema_version: 3,
      project_type: "extension",
      primary_function: "interface-workflow",
      source_url: "https://github.com/Owner/Repo",
      name: "Example",
      description: null,
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
    },
  });
});

test("accepts a Short Description with exactly 220 normalized characters", () => {
  const description = "x".repeat(220);

  expect(
    normalizeProjectSubmissionManifest({
      schema_version: 3,
      project_type: "frontend",
      primary_function: "frontend",
      source_url: "https://github.com/example/frontend",
      name: null,
      description: `  ${description}  `,
      frontends: { known_ids: [], other: [] },
      frontend_independent: false,
      additional_context: null,
    }),
  ).toMatchObject({
    valid: true,
    manifest: { description },
  });
});

test("rejects a Short Description over 220 normalized characters", () => {
  expect(
    normalizeProjectSubmissionManifest({
      schema_version: 3,
      project_type: "frontend",
      primary_function: "frontend",
      source_url: "https://github.com/example/frontend",
      name: null,
      description: `  ${"x".repeat(221)}  `,
      frontends: { known_ids: [], other: [] },
      frontend_independent: false,
      additional_context: null,
    }),
  ).toEqual({
    valid: false,
    errors: ["Short Description must be 220 characters or fewer."],
  });
});

test("requires name and description for an external preset", () => {
  const result = normalizeProjectSubmissionManifest({
    schema_version: 3,
    project_type: "preset",
    primary_function: "preset",
    source_url: "https://example.com/preset",
    name: null,
    description: null,
    frontends: { known_ids: ["sillytavern"], other: [] },
    frontend_independent: false,
    additional_context: null,
    preset_compatibility: {
      model_families: { known_ids: ["model-agnostic"], other: [] },
      completion_formats: ["chat-completion"],
    },
  });

  expect(result).toMatchObject({ valid: false });
  if (result.valid) throw new Error("Expected invalid manifest");
  expect(result.errors).toEqual(
    expect.arrayContaining([
      "External System Presets require a project name.",
      "External System Presets require a short description.",
    ]),
  );
});

test("requires a GitHub or Codeberg repository for a Frontend", () => {
  const result = normalizeProjectSubmissionManifest({
    schema_version: 3,
    project_type: "frontend",
    primary_function: "frontend",
    source_url: "https://example.com/frontend",
    name: null,
    description: null,
    frontends: { known_ids: [], other: [] },
    frontend_independent: false,
    additional_context: null,
  });

  expect(result).toMatchObject({ valid: false });
  if (result.valid) throw new Error("Expected invalid manifest");
  expect(result.errors).toEqual([
    "Frontends and Extensions require a public GitHub or Codeberg repository.",
  ]);
});

test.each(["frontend", "preset"] as const)(
  "treats a Codeberg %s as repository-backed metadata",
  (projectType) => {
    const result = normalizeProjectSubmissionManifest({
      schema_version: 3,
      project_type: projectType,
      primary_function: projectType,
      source_url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
      name: null,
      description: null,
      frontends: { known_ids: [], other: [] },
      frontend_independent: projectType === "preset",
      additional_context: null,
      ...(projectType === "preset"
        ? {
            preset_compatibility: {
              model_families: { known_ids: ["model-agnostic"], other: [] },
              completion_formats: ["chat-completion"],
            },
          }
        : {}),
    });

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
      schema_version: 3,
      project_type: "frontend",
      primary_function: "frontend",
      source_url: "https://github.com/Owner/Frontend",
      name: "Frontend",
      description: null,
      frontends: { known_ids: [], other: [] },
      frontend_independent: false,
      additional_context: null,
    }),
  ).toBe(
    '{\n  "schema_version": 3,\n  "project_type": "frontend",\n  "primary_function": "frontend",\n  "source_url": "https://github.com/Owner/Frontend",\n  "name": "Frontend",\n  "description": null,\n  "frontends": {\n    "known_ids": [],\n    "other": []\n  },\n  "frontend_independent": false,\n  "additional_context": null\n}\n',
  );
});

test("limits unlisted model family names to 60 characters", () => {
  const result = normalizeProjectSubmissionManifest({
    schema_version: 3,
    project_type: "preset",
    primary_function: "preset",
    source_url: "https://github.com/Owner/Preset",
    name: "Preset",
    description: null,
    frontends: { known_ids: ["sillytavern"], other: [] },
    frontend_independent: false,
    additional_context: null,
    preset_compatibility: {
      model_families: {
        known_ids: [],
        other: ["x".repeat(61)],
      },
      completion_formats: ["chat-completion"],
    },
  });

  expect(result).toEqual({
    valid: false,
    errors: ["Unlisted model families must be 60 characters or fewer."],
  });
});

test("preserves Model-Agnostic with recommended and unlisted families", () => {
  expect(
    normalizeProjectSubmissionManifest({
      schema_version: 3,
      project_type: "preset",
      primary_function: "preset",
      source_url: "https://github.com/Owner/Preset",
      name: "Preset",
      description: null,
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
      preset_compatibility: {
        model_families: {
          known_ids: ["model-agnostic", "claude", "model-agnostic"],
          other: ["FutureModel"],
        },
        completion_formats: ["chat-completion"],
      },
    }),
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
