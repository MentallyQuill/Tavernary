import { expect, test } from "vitest";

import { modelProviderOptionsFromEnvironment } from "../../scripts/catalog/model-provider-configuration.mjs";

test("maps UTILITY to primary and TAVERNARY_ENRICHMENT to JSON repair", () => {
  expect(
    modelProviderOptionsFromEnvironment({
      UTILITY_API_ENDPOINT: "https://nano.example/v1/chat/completions",
      UTILITY_API_KEY: "utility-key",
      UTILITY_MODEL: "deepseek/deepseek-v4-flash-0731:thinking",
      TAVERNARY_ENRICHMENT_API_URL:
        "https://api.openai.com/v1/chat/completions",
      TAVERNARY_ENRICHMENT_API_KEY: "repair-key",
      TAVERNARY_ENRICHMENT_MODEL: "gpt-5.6-luna",
    }),
  ).toEqual({
    apiUrl: "https://nano.example/v1/chat/completions",
    apiKey: "utility-key",
    model: "deepseek/deepseek-v4-flash-0731:thinking",
    jsonRepair: {
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: "repair-key",
      model: "gpt-5.6-luna",
    },
  });
});

test("does not silently reverse primary and repair providers", () => {
  const options = modelProviderOptionsFromEnvironment({
    UTILITY_MODEL: "utility-model",
    TAVERNARY_ENRICHMENT_MODEL: "repair-model",
  });

  expect(options.model).toBe("utility-model");
  expect(options.jsonRepair.model).toBe("repair-model");
});
