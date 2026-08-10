export function modelProviderOptionsFromEnvironment(environment = process.env) {
  return {
    apiUrl: environment.UTILITY_API_ENDPOINT,
    apiKey: environment.UTILITY_API_KEY,
    model: environment.UTILITY_MODEL,
    jsonRepair: {
      apiUrl: environment.TAVERNARY_ENRICHMENT_API_URL,
      apiKey: environment.TAVERNARY_ENRICHMENT_API_KEY,
      model: environment.TAVERNARY_ENRICHMENT_MODEL,
    },
  };
}
