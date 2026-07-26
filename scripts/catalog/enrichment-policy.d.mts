export const MANUAL_ENRICHMENT_REASON_CODE: "manual-enrichment-policy";

export interface EnrichmentPolicyRecord {
  id: string;
  enrichment_policy?: "automatic" | "manual";
  enrichment_note?: string;
  [key: string]: unknown;
}

export interface ManualEnrichmentExclusion {
  projectId: string;
  reason: typeof MANUAL_ENRICHMENT_REASON_CODE;
  note?: string;
}

export function defaultEnrichmentFields(source: {
  type?: string;
  [key: string]: unknown;
}): {
  enrichment_policy: "automatic" | "manual";
  enrichment_note?: string;
};

export function isAutomaticEnrichment(record: EnrichmentPolicyRecord): boolean;

export function manualEnrichmentExclusions(
  records: EnrichmentPolicyRecord[],
): ManualEnrichmentExclusion[];

export class ManualEnrichmentPolicyError extends Error {
  projectId: string;
  code: typeof MANUAL_ENRICHMENT_REASON_CODE;
  note: string;
  enrichmentNote: string;
  constructor(record: EnrichmentPolicyRecord);
}

export function assertAutomaticEnrichment<T extends EnrichmentPolicyRecord>(
  record: T,
): T;
