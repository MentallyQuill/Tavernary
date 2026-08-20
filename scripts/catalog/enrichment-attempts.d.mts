export type EnrichmentValidation =
  | { valid: true }
  | {
      valid: false;
      errors?: string[];
      message?: string;
      repairHint?: string;
    };

export const TRANSIENT_PROVIDER_RETRY_DELAYS_MS: readonly [5000, 15000, 30000];

export function generateWithTransientProviderRetries<TInput, TOutput>(options: {
  input: TInput;
  generate(input: TInput): Promise<TOutput>;
  sleep?(milliseconds: number): Promise<void>;
  retryDelays?: readonly number[];
}): Promise<TOutput>;

export function generateValidatedEnrichment<
  TInput,
  TOutput,
  TMetadata,
>(options: {
  initialInput: TInput;
  maxAttempts?: number;
  generate(input: TInput): Promise<{ output: TOutput; metadata: TMetadata }>;
  validate(output: TOutput): EnrichmentValidation;
  repair(
    input: TInput,
    validation: Extract<EnrichmentValidation, { valid: false }>,
    output: TOutput,
  ): TInput;
}): Promise<{
  output: TOutput;
  metadata: TMetadata;
  validation: EnrichmentValidation;
}>;
