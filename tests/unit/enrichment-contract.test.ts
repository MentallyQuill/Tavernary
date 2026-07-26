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
  primary_function: "developer-infrastructure",
  capabilities: ["automation", "prompt-engineering"],
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
