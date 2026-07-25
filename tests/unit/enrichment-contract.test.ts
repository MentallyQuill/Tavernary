import { expect, test } from "vitest";

import { validateEnrichmentOutput } from "../../scripts/catalog/enrichment-contract.mjs";

const vocabularies = {
  primaryFunctions: [
    { id: "frontend", label: "Frontend" },
    { id: "developer-infrastructure", label: "Developer infrastructure" },
  ],
  capabilities: [
    { id: "automation", label: "Automation" },
    { id: "prompt-engineering", label: "Prompt engineering" },
  ],
};

const valid = {
  summary:
    "A compact toolkit for automating prompt workflows and maintaining projects in SillyTavern.",
  metadata_status: "curated" as const,
  primary_function: "developer-infrastructure",
  capabilities: ["automation", "prompt-engineering"],
};

test("accepts a valid one-sentence curated enrichment", () => {
  expect(validateEnrichmentOutput(valid, vocabularies)).toEqual({
    valid: true,
  });
});

test("allows ordinary parenthesized prose", () => {
  expect(
    validateEnrichmentOutput(
      {
        ...valid,
        summary:
          "A compact toolkit (with automation) for maintaining prompt workflows in SillyTavern projects.",
      },
      vocabularies,
    ),
  ).toEqual({ valid: true });
});

test.each([
  ["exact fallback", "No README file found."],
  ["overlong", "A ".repeat(70)],
  ["too few words", "A toolkit."],
  ["too many words", `${"A useful toolkit ".repeat(20)}for prompts.`],
  ["newline", "A compact toolkit\nfor prompts."],
  ["unicode newline", "A compact toolkit\u2028for prompts."],
  ["markdown", "- A compact toolkit for prompt workflows."],
  ["inline markdown", "A compact `toolkit` for prompt workflows."],
  ["multiple sentences", "A compact toolkit. It automates prompts."],
] as const)("rejects invalid summary: %s", (_name, summary) => {
  const result = validateEnrichmentOutput({ ...valid, summary }, vocabularies);
  if (_name === "exact fallback") {
    expect(result).toEqual({ valid: true });
  } else {
    expect(result.valid).toBe(false);
  }
});

test("rejects unknown vocabulary IDs and non-curated metadata", () => {
  const result = validateEnrichmentOutput(
    {
      ...valid,
      metadata_status: "provisional" as "curated",
      primary_function: "unknown-function",
      capabilities: ["unknown-capability"],
    },
    vocabularies,
  );

  expect(result).toMatchObject({ valid: false });
  if (!result.valid) {
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "metadata_status must be curated",
        "primary_function is not in the controlled vocabulary",
        "capabilities contains an unknown controlled vocabulary ID: unknown-capability",
      ]),
    );
  }
});
