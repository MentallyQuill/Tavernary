import { expect, test } from "vitest";

import { validateEnrichmentOutput } from "../../scripts/catalog/enrichment-contract.mjs";

const tagVocabulary = {
  schema_version: 1,
  tags: [
    {
      id: "automate-roleplay-workflows",
      label: "Automate roleplay workflows",
      facet: "goal",
      description: "Automates repeated roleplay setup or execution.",
      aliases: ["automation"],
      applicable_kinds: ["extension"],
      inclusion_guidance: ["The source describes repeatable automation."],
      exclusion_guidance: [],
    },
    {
      id: "works-offline",
      label: "Works offline",
      facet: "trait",
      description: "Works without a hosted dependency.",
      aliases: [],
      applicable_kinds: ["extension", "preset"],
      inclusion_guidance: ["The source explicitly describes offline use."],
      exclusion_guidance: [],
    },
  ],
};

const summary =
  "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.";

const summaryOutput = {
  summary: {
    value: summary,
    evidence: ["readme:12-18"],
  },
  result: "accepted-unchanged" as const,
  change_reasons: [],
  policy_signal: "none" as const,
};

const tagsOutput = {
  tags: [
    {
      id: "automate-roleplay-workflows",
      evidence: ["readme:42-55"],
    },
  ],
};

function context(
  requestedFields: Array<"summary" | "tags"> = ["summary", "tags"],
) {
  return {
    requestedFields,
    kind: "extension",
    tagVocabulary,
    copyContext: {
      mode: "synthesize" as const,
      submittedSummary: "",
      protectedTerms: ["Fixture"],
    },
  };
}

test("validates independently requested summary and tags", () => {
  expect(
    validateEnrichmentOutput({ ...summaryOutput, ...tagsOutput }, context()),
  ).toEqual({ valid: true });
});

test("validates tags without requiring summary when only tags were requested", () => {
  expect(validateEnrichmentOutput(tagsOutput, context(["tags"]))).toEqual({
    valid: true,
  });
});

test("validates summary without requiring tags when only summary was requested", () => {
  expect(validateEnrichmentOutput(summaryOutput, context(["summary"]))).toEqual(
    { valid: true },
  );
});

test("rejects a manual field returned by the provider", () => {
  const result = validateEnrichmentOutput(
    { ...summaryOutput, ...tagsOutput },
    context(["tags"]),
  );

  expect(result).toMatchObject({ valid: false });
  if (!result.valid) {
    expect(result.errors).toContain("summary was not requested");
  }
});

test("requires copy-policy diagnostics only when summary is requested", () => {
  const { result: _result, ...missingResult } = summaryOutput;

  expect(
    validateEnrichmentOutput(missingResult, context(["summary"])),
  ).toMatchObject({ valid: false });
  expect(validateEnrichmentOutput(tagsOutput, context(["tags"]))).toEqual({
    valid: true,
  });
});

test.each([
  [
    "overlong",
    "Fixture organizes repeatable prompt workflows for SillyTavern projects with a deliberately excessive amount of qualifying language. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout every unusually elaborate creative project.",
  ],
  [
    "under minimum",
    "Fixture organizes prompt workflows. It keeps configuration clear and accessible.",
  ],
  [
    "newline",
    "Fixture organizes repeatable prompt workflows for SillyTavern projects.\nIt automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
  ],
  [
    "markdown",
    "- Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
  ],
] as const)("rejects invalid summary: %s", (_name, value) => {
  expect(
    validateEnrichmentOutput(
      {
        ...summaryOutput,
        summary: { value, evidence: ["readme:12-18"] },
      },
      context(["summary"]),
    ),
  ).toMatchObject({ valid: false });
});

test("rejects unknown, duplicate, excessive, and kind-inapplicable tags", () => {
  const unknown = validateEnrichmentOutput(
    { tags: [{ id: "invented", evidence: ["readme:1"] }] },
    context(["tags"]),
  );
  expect(unknown).toMatchObject({ valid: false });

  const duplicate = validateEnrichmentOutput(
    {
      tags: [
        {
          id: "automate-roleplay-workflows",
          evidence: ["readme:1"],
        },
        {
          id: "automate-roleplay-workflows",
          evidence: ["readme:2"],
        },
      ],
    },
    context(["tags"]),
  );
  expect(duplicate).toMatchObject({ valid: false });

  const wrongKind = validateEnrichmentOutput(tagsOutput, {
    ...context(["tags"]),
    kind: "preset",
  });
  expect(wrongKind).toMatchObject({ valid: false });
});

test("allows zero tags when evidence is inconclusive", () => {
  expect(validateEnrichmentOutput({ tags: [] }, context(["tags"]))).toEqual({
    valid: true,
  });
});

test("requires compact evidence for summaries and every selected tag", () => {
  expect(
    validateEnrichmentOutput(
      {
        ...summaryOutput,
        summary: { value: summary, evidence: [] },
      },
      context(["summary"]),
    ),
  ).toMatchObject({ valid: false });
  expect(
    validateEnrichmentOutput(
      {
        tags: [{ id: "automate-roleplay-workflows", evidence: [] }],
      },
      context(["tags"]),
    ),
  ).toMatchObject({ valid: false });
});

test("rejects output fields outside the requested metadata contract", () => {
  const result = validateEnrichmentOutput(
    {
      ...tagsOutput,
      capabilities: ["automation"],
      primary_function: "developer-infrastructure",
      metadata_status: "curated",
    } as never,
    context(["tags"]),
  );

  expect(result).toMatchObject({ valid: false });
  if (!result.valid) {
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "generation output contains unknown key: capabilities",
        "generation output contains unknown key: primary_function",
        "generation output contains unknown key: metadata_status",
      ]),
    );
  }
});
