export type EnrichmentValidation =
  | { valid: true }
  | {
      valid: false;
      errors?: string[];
      message?: string;
      repairHint?: string;
    };

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
