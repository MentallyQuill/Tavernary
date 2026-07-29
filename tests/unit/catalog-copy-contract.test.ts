import { expect, test } from "vitest";

import { validateCatalogCopyResult } from "../../scripts/catalog/catalog-copy-contract.mjs";

function preserveContext(submittedSummary: string) {
  return {
    mode: "preserve" as const,
    submittedSummary,
    protectedTerms: ["ST-QuickReply"],
  };
}

test("accepts byte-identical unchanged owner copy", () => {
  expect(
    validateCatalogCopyResult(
      {
        summary: "ST-QuickReply keeps the author's exact workflow.",
        result: "accepted-unchanged",
        change_reasons: [],
        policy_signal: "none",
      },
      preserveContext("ST-QuickReply keeps the author's exact workflow."),
    ).valid,
  ).toBe(true);
});

test("rejects an unchanged result whose summary was modified", () => {
  expect(
    validateCatalogCopyResult(
      {
        summary: "ST-QuickReply changes the author's exact workflow.",
        result: "accepted-unchanged",
        change_reasons: [],
        policy_signal: "none",
      },
      preserveContext("ST-QuickReply keeps the author's exact workflow."),
    ),
  ).toMatchObject({
    valid: false,
    errors: expect.arrayContaining([
      "accepted-unchanged summary must be byte-identical",
    ]),
  });
});

test("requires change reasons that agree with the result class", () => {
  const context = preserveContext("ST-QuickReply has a typo");
  expect(
    validateCatalogCopyResult(
      {
        summary: "ST-QuickReply has a typo.",
        result: "accepted-with-light-edits",
        change_reasons: [],
        policy_signal: "none",
      },
      context,
    ),
  ).toMatchObject({ valid: false });
  expect(
    validateCatalogCopyResult(
      {
        summary: "ST-QuickReply has public wording.",
        result: "accepted-with-policy-rewrite",
        change_reasons: ["punctuation-corrected"],
        policy_signal: "catalog-policy-rewrite",
      },
      context,
    ),
  ).toMatchObject({ valid: false });
  expect(
    validateCatalogCopyResult(
      {
        summary: "ST-QuickReply has public wording.",
        result: "accepted-with-policy-rewrite",
        change_reasons: ["graphic-wording-neutralized"],
        policy_signal: "catalog-policy-rewrite",
      },
      context,
    ),
  ).toMatchObject({ valid: true });
});

test("rejects unknown or duplicated change reasons and response properties", () => {
  const context = preserveContext("ST-QuickReply has a typo");
  for (const output of [
    {
      summary: "ST-QuickReply has a typo.",
      result: "accepted-with-light-edits",
      change_reasons: ["invented-reason"],
      policy_signal: "none",
    },
    {
      summary: "ST-QuickReply has a typo.",
      result: "accepted-with-light-edits",
      change_reasons: ["punctuation-corrected", "punctuation-corrected"],
      policy_signal: "none",
    },
    {
      summary: "ST-QuickReply has a typo.",
      result: "accepted-with-light-edits",
      change_reasons: ["punctuation-corrected"],
      policy_signal: "none",
      commentary: "extra",
    },
  ]) {
    expect(validateCatalogCopyResult(output, context)).toMatchObject({
      valid: false,
    });
  }
});

test("rejects emoji, markdown, active markup, and line breaks", () => {
  const context = preserveContext("ST-QuickReply works.");
  for (const summary of [
    "ST-QuickReply works 🧭.",
    "**ST-QuickReply** works.",
    "<script>ST-QuickReply works.</script>",
    "ST-QuickReply works.\nIt is stable.",
  ]) {
    expect(
      validateCatalogCopyResult(
        {
          summary,
          result: "accepted-with-light-edits",
          change_reasons: ["punctuation-corrected"],
          policy_signal: "none",
        },
        context,
      ),
    ).toMatchObject({ valid: false });
  }
});

test("requires every supplied protected term with exact spelling and case", () => {
  expect(
    validateCatalogCopyResult(
      {
        summary: "ST QuickReply keeps the workflow.",
        result: "accepted-with-light-edits",
        change_reasons: ["punctuation-corrected"],
        policy_signal: "none",
      },
      preserveContext("ST-QuickReply keeps the workflow"),
    ),
  ).toMatchObject({
    valid: false,
    errors: expect.arrayContaining([
      "summary must preserve every protected term exactly",
    ]),
  });
});

test.each([
  "ST-QuickReply is damn useful and keeps shit organized.",
  "ST-QuickReply supports consensual adult sexual roleplay, kinks, and fetishes.",
])("accepts permitted public catalog wording: %s", (summary) => {
  expect(
    validateCatalogCopyResult(
      {
        summary,
        result: "accepted-unchanged",
        change_reasons: [],
        policy_signal: "none",
      },
      preserveContext(summary),
    ),
  ).toMatchObject({ valid: true });
});

test("returns a sanitized repair hint without echoing raw source text", () => {
  const submittedSummary = "ST-QuickReply private raw source phrase";
  const validation = validateCatalogCopyResult(
    {
      summary: "different raw source phrase",
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    },
    preserveContext(submittedSummary),
  );
  expect(validation).toMatchObject({ valid: false });
  if (validation.valid) throw new Error("expected invalid output");
  expect(validation.repairHint).not.toContain(submittedSummary);
  expect(validation.repairHint).not.toContain("different raw source phrase");
});
