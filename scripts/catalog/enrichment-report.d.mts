import type { EnrichmentRunState } from "./enrichment-run-state.d.mts";

export type EnrichmentReport = EnrichmentRunState;

export function createEnrichmentReport(
  state: EnrichmentRunState,
): EnrichmentReport;

export function validateEnrichmentReport(value: unknown): EnrichmentReport;
