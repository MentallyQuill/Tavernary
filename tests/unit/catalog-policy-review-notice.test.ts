import { expect, test } from "vitest";
import { renderCatalogPolicyReviewIssue } from "../../scripts/moderation/catalog-policy-review-notice.mjs";

test("renders a bounded neutral maintenance advisory with inert summaries", () => {
  const issue = renderCatalogPolicyReviewIssue({
    project: {
      id: "alpha",
      name: "Alpha",
      summary: "Published summary.",
    },
    sourceUrl: "https://github.com/Owner/Alpha",
    output: {
      status: "review-suggested",
      category: "potential-hate-or-discrimination",
      explanation: "The project purpose may promote discriminatory treatment.",
    },
    submittedSummary: "@staff ``` unsafe",
    copyReasons: ["discriminatory-framing-neutralized"],
    transactionIssueNumber: 128,
    transactionPullNumber: 129,
    evidenceFingerprint: "a".repeat(64),
    policyVersion: "2026-07-29",
    reviewedAt: "2026-07-29T12:00:00.000Z",
    readmeUrl:
      "https://github.com/Owner/Alpha/blob/abcdef/README.md",
  });
  expect(issue.title).toBe("[Catalog policy advisory] Alpha");
  expect(issue.body).toContain("Automated advisory only");
  expect(issue.body).toContain("No enforcement action was taken automatically");
  expect(issue.body).toContain("Potential hate or discrimination");
  expect(issue.body).toContain("Exact submitted summary");
  expect(issue.body).toContain("Published summary.");
  expect(issue.body).toContain("discriminatory-framing-neutralized");
  expect(issue.body).toContain("/blob/abcdef/README.md");
  expect(issue.body).toContain(
    "<!-- tavernary-catalog-policy-review:alpha -->",
  );
  expect(issue.body).not.toContain("@staff");
  expect(issue.body).not.toContain("raw_provider_payload");
});
