import { expect, test } from "vitest";
import { catalogPolicyReviewInstructions } from "../../scripts/moderation/catalog-policy-review-provider.mjs";

test("defines contextual advisory-only prompt boundaries", () => {
  const prompt = catalogPolicyReviewInstructions();
  const normalized = prompt.toLocaleLowerCase();
  for (const allowed of [
    "consensual adult sexual content",
    "kink",
    "fetish",
    "ordinary profanity",
    "Quotations",
    "historical discussion",
    "fictional antagonists",
    "security documentation",
    "incidental terms",
    "isolated words",
  ]) {
    expect(normalized).toContain(allowed.toLocaleLowerCase());
  }
  expect(normalized).toContain("do not make enforcement decisions");
  expect(normalized).toContain("must not quote or reproduce raw source text");
  expect(normalized).toContain("do not use keyword matching");
});
