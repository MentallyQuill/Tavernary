export function modelProviderOptionsFromEnvironment(environment = process.env) {
  return {
    apiUrl: environment.UTILITY_API_ENDPOINT,
    apiKey: environment.UTILITY_API_KEY,
    model: environment.UTILITY_MODEL,
    ...(environment.TAVERNARY_REQUIRE_MODEL_BUDGET === "true"
      ? { requireBudget: true }
      : {}),
    ...(environment.UTILITY_REASONING_EFFORT
      ? { reasoningEffort: environment.UTILITY_REASONING_EFFORT }
      : {}),
    jsonRepair: {
      apiUrl: environment.TAVERNARY_ENRICHMENT_API_URL,
      apiKey: environment.TAVERNARY_ENRICHMENT_API_KEY,
      model: environment.TAVERNARY_ENRICHMENT_MODEL,
    },
  };
}
