import { createStructuredProviderTransport } from "../catalog/enrichment-provider.mjs";
import { CATALOG_POLICY_REVIEW_CATEGORIES } from "./catalog-policy-review-contract.mjs";

export function catalogPolicyReviewInstructions() {
  return `You provide a non-blocking advisory signal for Tavernary staff. You do not make enforcement decisions and must not quote or reproduce raw source text.

Suggest review only when the project's apparent purpose, supported use, or promoted theme may conflict with the public Catalog Policy. Consensual adult sexual content, adult roleplay, kink, fetish content, and ordinary profanity are explicitly permitted and are not reasons for review. Quotations, historical discussion, fictional antagonists, security documentation, incidental terms, and isolated words do not establish a project's purpose. Do not use keyword matching.

The controlled advisory categories are: ${CATALOG_POLICY_REVIEW_CATEGORIES.join(", ")}. Return clear when the bounded evidence does not contextually support one category. Return only the required structured object.`;
}

function responseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["status", "category", "explanation"],
    properties: {
      status: { type: "string", enum: ["clear", "review-suggested"] },
      category: {
        anyOf: [
          { type: "null" },
          { type: "string", enum: CATALOG_POLICY_REVIEW_CATEGORIES },
        ],
      },
      explanation: {
        anyOf: [
          { type: "null" },
          { type: "string", minLength: 1, maxLength: 320 },
        ],
      },
    },
  };
}

export function createCatalogPolicyReviewProvider(configuration) {
  const transport = createStructuredProviderTransport(configuration);
  return {
    async review(input) {
      return transport.request({
        model: transport.configuration.model,
        temperature: 0,
        messages: [
          { role: "system", content: catalogPolicyReviewInstructions() },
          {
            role: "user",
            content: JSON.stringify({
              project: input.project,
              policy_version: input.policyVersion,
              repository_description: String(
                input.repositoryDescription ?? "",
              ).slice(0, 500),
              readme: String(input.readme ?? "").slice(0, 16_000),
            }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "tavernary_catalog_policy_review",
            strict: true,
            schema: responseSchema(),
          },
        },
      });
    },
  };
}
