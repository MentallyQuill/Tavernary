import type { EnrichmentRunState } from "./enrichment-run-state.d.mts";

export type EnrichmentReport = EnrichmentRunState & {
  provider_metrics: {
    call_count: number;
    repair_call_count: number;
    rate_limit_events: number;
    latency_ms_total: number;
  };
};

export function createEnrichmentReport(
  state: EnrichmentRunState,
): EnrichmentReport;

export function validateEnrichmentReport(value: unknown): EnrichmentReport;
