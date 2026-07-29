import {
  CATALOG_COPY_CHANGE_REASON_VALUES,
  CATALOG_COPY_POLICY_SIGNAL_VALUES,
  CATALOG_COPY_RESULT_VALUES,
  catalogCopyInstructions,
} from "./catalog-copy-contract.mjs";
import { createStructuredProviderTransport } from "./enrichment-provider.mjs";

function responseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "result", "change_reasons", "policy_signal"],
    properties: {
      summary: { type: "string", minLength: 1, maxLength: 220 },
      result: {
        type: "string",
        enum: CATALOG_COPY_RESULT_VALUES,
      },
      change_reasons: {
        type: "array",
        uniqueItems: true,
        items: {
          type: "string",
          enum: CATALOG_COPY_CHANGE_REASON_VALUES,
        },
      },
      policy_signal: {
        type: "string",
        enum: CATALOG_COPY_POLICY_SIGNAL_VALUES,
      },
    },
  };
}

export function createCatalogCopyProvider(options) {
  const transport = createStructuredProviderTransport(options);
  return {
    async generate(input) {
      return transport.request({
        model: transport.configuration.model,
        temperature: input.repair ? 0 : input.mode === "preserve" ? 0.1 : 0.7,
        messages: [
          { role: "system", content: catalogCopyInstructions() },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "tavernary_catalog_copy",
            strict: true,
            schema: responseSchema(),
          },
        },
      });
    },
  };
}
