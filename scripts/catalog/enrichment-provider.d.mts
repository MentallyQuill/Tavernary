import type { EnrichmentInput, EnrichmentOutput } from "./enrich-readmes.d.mts";

export const ENRICHMENT_TIMEOUT_MS: 120000;
export const MAX_PROVIDER_RESPONSE_BYTES: 262144;
export const MAX_JSON_REPAIR_INPUT_BYTES: 65536;
export const MAX_JSON_REPAIR_RESPONSE_BYTES: 131072;
export const MAX_JSON_REPAIR_COMPLETION_TOKENS: 4096;

export type ProviderConfiguration = {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
};

export type JsonRepairMetadata = {
  diagnosticCode: string;
  requestedModel: string;
  returnedModel: string | null;
  latencyMs: number;
  succeeded: true;
};

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
  constructor(
    code: ProviderErrorCode,
    diagnosticCode?: string | null,
    details?: { timeoutMs?: number; latencyMs?: number },
  );
  code: ProviderErrorCode;
  diagnosticCode: string | null;
  latencyMs: number | null;
}

export type ProviderResult = {
  output: EnrichmentOutput;
  metadata: {
    requestedModel: string;
    returnedModel: string | null;
    latencyMs: number;
    jsonRepair?: JsonRepairMetadata;
  };
};

export function validateProviderConfiguration(input: ProviderConfiguration): {
  apiUrl: string;
  apiKey: string;
  model: string;
};

export function parseProviderMessage(message: unknown): EnrichmentOutput;

export function createStructuredProviderTransport(
  options: ProviderConfiguration & {
    jsonRepair?: ProviderConfiguration;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
  },
): {
  configuration: { apiUrl: string; apiKey: string; model: string };
  request(body: Record<string, unknown>): Promise<{
    output: unknown;
    metadata: ProviderResult["metadata"];
  }>;
};

export function createEnrichmentProvider(
  options: ProviderConfiguration & {
    jsonRepair?: ProviderConfiguration;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
  },
): {
  generate(input: EnrichmentInput): Promise<ProviderResult>;
};
