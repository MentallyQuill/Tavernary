import { expect, test } from "vitest";

import type { TagVocabulary } from "../../scripts/catalog/tag-vocabulary.mjs";
import {
  validateTagGenerationOutput,
  validateTagSelection,
} from "../../scripts/catalog/tag-classification.mjs";

const vocabulary: TagVocabulary = {
  schema_version: 1 as const,
  tags: Array.from({ length: 7 }, (_, index) => ({
    id:
      index === 0
        ? "maintain-long-term-memory"
        : index === 1
          ? "local-first"
          : `tag-${index + 1}`,
    label: `Tag ${index + 1}`,
    facet: index === 1 ? ("trait" as const) : ("goal" as const),
    description: `Description ${index + 1}`,
    aliases: [],
    applicable_kinds: index === 6 ? ["frontend"] : ["extension", "preset"],
    inclusion_guidance: ["Use when supported."],
    exclusion_guidance: ["Do not infer."],
  })),
};

test("accepts zero through six unique supported tags", () => {
  expect(
    validateTagSelection({
      tags: [],
      vocabulary,
      kind: "extension",
    }),
  ).toEqual({ valid: true });
  expect(
    validateTagSelection({
      tags: vocabulary.tags.slice(0, 6).map((tag) => tag.id),
      vocabulary,
      kind: "extension",
    }),
  ).toEqual({ valid: true });
});

test.each([
  [
    "seven tags",
    vocabulary.tags.map((tag) => tag.id),
    "tags must contain at most 6 IDs",
  ],
  [
    "duplicate tags",
    ["maintain-long-term-memory", "maintain-long-term-memory"],
    "tags must contain unique IDs",
  ],
  ["unknown tag", ["unknown"], "tags contains unknown ID: unknown"],
  ["wrong project kind", ["tag-7"], "tag tag-7 does not apply to extension"],
] as const)("rejects %s", (_label, tags, message) => {
  const result = validateTagSelection({
    tags: [...tags],
    vocabulary,
    kind: "extension",
  });
  expect(result.valid).toBe(false);
  if (!result.valid) expect(result.errors).toContain(message);
});

test("returns canonical tags separately from compact generation evidence", () => {
  expect(
    validateTagGenerationOutput(
      {
        tags: [
          {
            id: "maintain-long-term-memory",
            evidence: ["readme:42-55"],
          },
          { id: "local-first", evidence: ["readme:8-12"] },
        ],
      },
      {
        fields: ["tags"],
        vocabulary,
        kind: "extension",
      },
    ),
  ).toEqual({
    valid: true,
    tags: ["maintain-long-term-memory", "local-first"],
    evidence: {
      "maintain-long-term-memory": ["readme:42-55"],
      "local-first": ["readme:8-12"],
    },
  });
});

test.each([
  [
    "missing evidence",
    {
      tags: [{ id: "maintain-long-term-memory", evidence: [] }],
    },
    "tag maintain-long-term-memory requires at least one evidence reference",
  ],
  [
    "unexpected summary",
    {
      summary: {
        value:
          "This generated summary contains enough words to satisfy the catalog contract. It also provides a second concise sentence grounded in repository evidence.",
        evidence: ["readme:1-6"],
      },
      tags: [],
    },
    "summary was not requested",
  ],
  [
    "unknown output key",
    { tags: [], explanation: "extra" },
    "generation output contains unknown key: explanation",
  ],
] as const)("rejects %s", (_label, output, message) => {
  const result = validateTagGenerationOutput(output, {
    fields: ["tags"],
    vocabulary,
    kind: "extension",
  });
  expect(result.valid).toBe(false);
  if (!result.valid) expect(result.errors).toContain(message);
});

test("validates a requested summary independently from tags", () => {
  const result = validateTagGenerationOutput(
    {
      summary: {
        value:
          "This extension organizes persistent roleplay memories into structured books for later retrieval. It offers focused controls that keep long-running conversations coherent and manageable over time.",
        evidence: ["readme:1-18"],
      },
    },
    {
      fields: ["summary"],
      vocabulary,
      kind: "extension",
    },
  );

  expect(result).toMatchObject({
    valid: true,
    summary:
      "This extension organizes persistent roleplay memories into structured books for later retrieval. It offers focused controls that keep long-running conversations coherent and manageable over time.",
    summaryEvidence: ["readme:1-18"],
  });
});

test("rejects generated summaries shorter than 120 characters", () => {
  const result = validateTagGenerationOutput(
    {
      summary: {
        value: "A".repeat(119),
        evidence: ["readme:1-4"],
      },
    },
    {
      fields: ["summary"],
      vocabulary,
      kind: "extension",
    },
  );

  expect(result).toMatchObject({ valid: false });
  if (!result.valid) {
    expect(result.errors).toContain(
      "summary value must be at least 120 characters",
    );
  }
});

test("accepts a 120-character summary without word or sentence rules", () => {
  const value = "A".repeat(120);

  expect(
    validateTagGenerationOutput(
      {
        summary: {
          value,
          evidence: ["readme:1-4"],
        },
      },
      {
        fields: ["summary"],
        vocabulary,
        kind: "extension",
      },
    ),
  ).toMatchObject({ valid: true, summary: value });
});

test("rejects an absolute URL in a generated summary", () => {
  const result = validateTagGenerationOutput(
    {
      summary: {
        value: `${"Source-grounded catalog text ".repeat(5)}https://example.com`,
        evidence: ["readme:1-4"],
      },
    },
    {
      fields: ["summary"],
      vocabulary,
      kind: "extension",
    },
  );

  expect(result).toMatchObject({ valid: false });
  if (!result.valid) {
    expect(result.errors).toContain(
      "summary value must not contain URLs or domain-style links",
    );
  }
});

test("rejects a protocol-relative URL in a generated summary", () => {
  const result = validateTagGenerationOutput(
    {
      summary: {
        value: `${"Source-grounded catalog text ".repeat(5)}//example.com/path`,
        evidence: ["readme:1-4"],
      },
    },
    {
      fields: ["summary"],
      vocabulary,
      kind: "extension",
    },
  );

  expect(result).toMatchObject({ valid: false });
  if (!result.valid) {
    expect(result.errors).toContain(
      "summary value must not contain URLs or domain-style links",
    );
  }
});

test("rejects a www address in a generated summary", () => {
  const result = validateTagGenerationOutput(
    {
      summary: {
        value: `${"Source-grounded catalog text ".repeat(5)}www.example.com`,
        evidence: ["readme:1-4"],
      },
    },
    {
      fields: ["summary"],
      vocabulary,
      kind: "extension",
    },
  );

  expect(result).toMatchObject({ valid: false });
  if (!result.valid) {
    expect(result.errors).toContain(
      "summary value must not contain URLs or domain-style links",
    );
  }
});

test("rejects a bare domain in a generated summary", () => {
  const result = validateTagGenerationOutput(
    {
      summary: {
        value: `${"Source-grounded catalog text ".repeat(5)}example.com`,
        evidence: ["readme:1-4"],
      },
    },
    {
      fields: ["summary"],
      vocabulary,
      kind: "extension",
    },
  );

  expect(result).toMatchObject({ valid: false });
  if (!result.valid) {
    expect(result.errors).toContain(
      "summary value must not contain URLs or domain-style links",
    );
  }
});
