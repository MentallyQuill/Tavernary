import { expect, test } from "vitest";
import {
  createPolicyEvidenceFingerprint,
  validateCatalogPolicyReviewOutput,
} from "../../scripts/moderation/catalog-policy-review-contract.mjs";

test.each([
  { status: "clear", category: null, explanation: null },
  {
    status: "review-suggested",
    category: "potential-hate-or-discrimination",
    explanation:
      "The project description appears to promote discriminatory treatment.",
  },
  { status: "review-unavailable", category: null, explanation: null },
])("accepts exact advisory output $status", (output) => {
  expect(validateCatalogPolicyReviewOutput(output)).toMatchObject({
    valid: true,
    value: output,
  });
});

test("rejects unknown keys, categories, and unsafe explanations", () => {
  for (const output of [
    { status: "clear", category: null, explanation: null, raw: "no" },
    {
      status: "review-suggested",
      category: "sexual-content",
      explanation: "x",
    },
    {
      status: "review-suggested",
      category: "potential-other-catalog-policy-conflict",
      explanation: "<script>",
    },
  ]) {
    expect(validateCatalogPolicyReviewOutput(output).valid).toBe(false);
  }
});

test("fingerprints project, immutable source evidence, and policy version", () => {
  const input = {
    projectId: "alpha",
    sourceId: "github-42",
    headSha: "a".repeat(40),
    policyVersion: "2026-07-29",
  };
  expect(createPolicyEvidenceFingerprint(input)).toMatch(/^[a-f0-9]{64}$/u);
  expect(createPolicyEvidenceFingerprint(input)).not.toBe(
    createPolicyEvidenceFingerprint({
      ...input,
      policyVersion: "next",
    }),
  );
});
