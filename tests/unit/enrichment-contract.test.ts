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
    "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
  metadata_status: "curated" as const,
  capabilities: ["automation", "prompt-engineering"],
  classification_review: null,
  result: "accepted-unchanged" as const,
  change_reasons: [],
  policy_signal: "none" as const,
};

test("accepts a natural two-sentence curated enrichment", () => {
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
          "A compact toolkit (with automation) maintains prompt workflows in SillyTavern projects. It keeps configuration clear, repeatable, and accessible for creators throughout complex projects today.",
      },
      vocabularies,
    ),
  ).toEqual({ valid: true });
});

test.each([
  ["exact fallback", "No README file found."],
  [
    "overlong",
    "Fixture organizes repeatable prompt workflows for SillyTavern projects with a deliberately excessive amount of qualifying language. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout every unusually elaborate creative project.",
  ],
  [
    "too few words",
    "Fixture organizes prompt workflows. It keeps configuration clear and accessible.",
  ],
  [
    "too many words",
    "Fixture organizes repeatable prompt workflows for SillyTavern projects while coordinating many different types of detailed configuration across numerous creator tools. It automates routine setup, preserves every creator-facing control, clarifies complicated options, maintains project structure, and supports unusually elaborate long-running creative work.",
  ],
  [
    "newline",
    "Fixture organizes repeatable prompt workflows for SillyTavern projects.\nIt automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
  ],
  [
    "unicode newline",
    "Fixture organizes repeatable prompt workflows for SillyTavern projects.\u2028It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
  ],
  [
    "markdown",
    "- Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
  ],
  [
    "inline markdown",
    "Fixture organizes repeatable `prompt` workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
  ],
  [
    "one sentence",
    "Fixture organizes repeatable prompt workflows for SillyTavern projects while automating routine setup, preserving creator-facing controls, and keeping complex configuration work clear and accessible throughout.",
  ],
  [
    "three sentences",
    "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup and preserves creator-facing controls. Complex configuration stays clear and accessible throughout.",
  ],
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
      capabilities: ["unknown-capability"],
    },
    vocabularies,
  );

  expect(result).toMatchObject({ valid: false });
  if (!result.valid) {
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "metadata_status must be curated",
        "capabilities contains an unknown controlled vocabulary ID: unknown-capability",
      ]),
    );
  }
});

test("rejects a model-owned primary function field", () => {
  const result = validateEnrichmentOutput(
    {
      ...valid,
      primary_function: "developer-infrastructure",
    } as never,
    vocabularies,
  );

  expect(result).toEqual({
    valid: false,
    errors: ["primary_function is not allowed in enrichment output"],
  });
});

test("rejects missing or inconsistent copy-result metadata", () => {
  const { result: _result, ...missingResult } = valid;
  expect(
    validateEnrichmentOutput(missingResult as never, vocabularies),
  ).toMatchObject({ valid: false });
  expect(
    validateEnrichmentOutput(
      {
        ...valid,
        result: "accepted-with-policy-rewrite",
        change_reasons: ["punctuation-corrected"],
        policy_signal: "catalog-policy-rewrite",
      },
      vocabularies,
    ),
  ).toMatchObject({ valid: false });
});

test("accepts only a bounded requested classification review", () => {
  const request = {
    submittedPrimaryFunction: "memory-retrieval",
    allowedPrimaryFunctions: [
      { id: "memory-retrieval", label: "Memory and retrieval" },
      { id: "interface-workflow", label: "Interface and workflow" },
    ],
  };

  expect(
    validateEnrichmentOutput(
      {
        ...valid,
        classification_review: {
          status: "confirmed",
          suggested_primary_function: "memory-retrieval",
          explanation: null,
        },
      },
      vocabularies,
      request,
    ),
  ).toEqual({ valid: true });

  expect(
    validateEnrichmentOutput(
      {
        ...valid,
        classification_review: {
          status: "possible-mismatch",
          suggested_primary_function: "interface-workflow",
          explanation:
            "The source primarily describes user-facing editing controls.",
        },
      },
      vocabularies,
      request,
    ),
  ).toEqual({ valid: true });
});

test.each([
  [
    "unrequested review",
    null,
    {
      status: "confirmed",
      suggested_primary_function: "memory-retrieval",
      explanation: null,
    },
  ],
  [
    "missing requested review",
    { submittedPrimaryFunction: "memory-retrieval" },
    null,
  ],
  [
    "confirmed alternate",
    { submittedPrimaryFunction: "memory-retrieval" },
    {
      status: "confirmed",
      suggested_primary_function: "interface-workflow",
      explanation: null,
    },
  ],
  [
    "mismatch without explanation",
    { submittedPrimaryFunction: "memory-retrieval" },
    {
      status: "possible-mismatch",
      suggested_primary_function: "interface-workflow",
      explanation: null,
    },
  ],
] as const)(
  "rejects %s classification review",
  (_name, partialRequest, review) => {
    const request =
      partialRequest === null
        ? null
        : {
            ...partialRequest,
            allowedPrimaryFunctions: [
              { id: "memory-retrieval", label: "Memory and retrieval" },
              { id: "interface-workflow", label: "Interface and workflow" },
            ],
          };
    expect(
      validateEnrichmentOutput(
        { ...valid, classification_review: review },
        vocabularies,
        request,
      ),
    ).toMatchObject({ valid: false });
  },
);
