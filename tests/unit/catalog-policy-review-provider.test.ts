import { expect, test } from "vitest";
import {
  catalogPolicyReviewInstructions,
  createCatalogPolicyReviewProvider,
} from "../../scripts/moderation/catalog-policy-review-provider.mjs";
import { reviewCatalogPolicy } from "../../scripts/moderation/review-catalog-policy.mjs";

const reviewInput = {
  project: {
    id: "alpha",
    name: "Alpha",
    kind: "extension",
    summary: "Summary.",
    source_id: "github-42",
  },
  source: { id: "github-42", type: "github", repository: "Owner/Alpha" },
  snapshot: { repository: { head_sha: "a".repeat(40) } },
  loadSource: async () => ({
    status: "ready",
    readmeText: "README evidence",
    repositoryDescription: "Repository description",
  }),
  now: "2026-10-08T12:00:00.000Z",
};

function providerResponse(output: unknown) {
  return new Response(
    JSON.stringify({
      model: "approved",
      choices: [{ message: { content: JSON.stringify(output) } }],
    }),
    { status: 200 },
  );
}

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

test("the real provider supplies review suggestions to the policy consumer", async () => {
  let requests = 0;
  const provider = createCatalogPolicyReviewProvider({
    apiUrl: "https://provider.example/v1/chat/completions",
    apiKey: "fixture-key",
    model: "approved",
    fetchImpl: async () => {
      requests += 1;
      return providerResponse({
        status: "review-suggested",
        category: "potential-other-catalog-policy-conflict",
        explanation: "The promoted project purpose warrants staff review.",
      });
    },
  });
  const result = await reviewCatalogPolicy({ ...reviewInput, provider });
  expect(result).toMatchObject({
    status: "review-suggested",
    output: {
      status: "review-suggested",
      category: "potential-other-catalog-policy-conflict",
      explanation: "The promoted project purpose warrants staff review.",
    },
    state: {
      status: "review-suggested",
      category: "potential-other-catalog-policy-conflict",
      retry: { attempts: 0, last_failure_at: null },
    },
  });
  expect(requests).toBe(1);
});

test("the provider rejects schema-invalid output before returning a review", async () => {
  let requests = 0;
  const provider = createCatalogPolicyReviewProvider({
    apiUrl: "https://provider.example/v1/chat/completions",
    apiKey: "fixture-key",
    model: "approved",
    fetchImpl: async () => {
      requests += 1;
      return providerResponse({ status: "clear", category: null });
    },
  });
  await expect(provider.review({})).rejects.toMatchObject({
    code: "provider-response-invalid",
    diagnosticCode: "json-schema-invalid",
  });
  expect(requests).toBe(1);
});

test("the policy consumer keeps schema-valid semantic violations unavailable", async () => {
  let requests = 0;
  const provider = createCatalogPolicyReviewProvider({
    apiUrl: "https://provider.example/v1/chat/completions",
    apiKey: "fixture-key",
    model: "approved",
    fetchImpl: async () => {
      requests += 1;
      return providerResponse({
        status: "clear",
        category: "potential-other-catalog-policy-conflict",
        explanation: "These details are invalid for a clear result.",
      });
    },
  });
  const result = await reviewCatalogPolicy({ ...reviewInput, provider });
  expect(result).toMatchObject({
    status: "review-unavailable",
    output: {
      status: "review-unavailable",
      category: null,
      explanation: null,
    },
    state: {
      status: "review-unavailable",
      retry: { attempts: 1, last_failure_at: "2026-10-08T12:00:00.000Z" },
    },
  });
  expect(requests).toBe(1);
});
