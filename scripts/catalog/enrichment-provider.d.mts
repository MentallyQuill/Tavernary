import type { EnrichmentInput, EnrichmentOutput } from "./enrich-readmes.d.mts";

export const ENRICHMENT_TIMEOUT_MS: 120000;

export type ProviderErrorCode =
  | "provider-timeout"
  | "provider-rate-limited"
  | "provider-server-error"
  | "provider-authentication-failed"
  | "provider-request-failed"
  | "provider-network-error"
  | "provider-response-invalid"
  | "provider-model-mismatch";

export class EnrichmentProviderError extends Error {
  code: ProviderErrorCode;
  diagnosticCode: string | null;
}

export type ProviderResult = {
  output: EnrichmentOutput;
  metadata: {
    requestedModel: string;
    returnedModel: string | null;
    latencyMs: number;
  };
};

export function validateProviderConfiguration(input: {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}): { apiUrl: string; apiKey: string; model: string };

export function parseProviderMessage(message: unknown): EnrichmentOutput;

export function createEnrichmentProvider(options: {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}): {
  generate(input: EnrichmentInput): Promise<ProviderResult>;
};
