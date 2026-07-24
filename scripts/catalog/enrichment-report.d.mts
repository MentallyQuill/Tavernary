export type EnrichmentReport = {
  generated_at: string;
  selected: number;
  enriched: string[];
  fallback: string[];
  skipped: string[];
  failed: Array<{ id: string; reason: string }>;
};

export function createEnrichmentReport(
  generatedAt: string,
  result: Omit<EnrichmentReport, "generated_at" | "selected">,
): EnrichmentReport;
