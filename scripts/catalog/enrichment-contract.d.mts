export type EnrichmentOutput = {
  summary: string;
  metadata_status: "curated";
  primary_function: string;
  capabilities: string[];
};

export type VocabularySet = {
  primaryFunctions: ReadonlySet<string> | readonly (string | { id: string })[];
  capabilities: ReadonlySet<string> | readonly (string | { id: string })[];
};

export function validateEnrichmentOutput(
  output: EnrichmentOutput,
  vocabularies: VocabularySet,
): { valid: true } | { valid: false; errors: string[] };
