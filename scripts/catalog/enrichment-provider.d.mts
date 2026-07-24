export function createEnrichmentProvider(options: {
  apiUrl: string;
  apiKey?: string;
  model: string;
  fetchImpl?: typeof fetch;
}): {
  generate(input: Record<string, unknown>): Promise<Record<string, unknown>>;
};
