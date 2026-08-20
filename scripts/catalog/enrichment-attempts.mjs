export const TRANSIENT_PROVIDER_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

const transientProviderCodes = new Set([
  "provider-timeout",
  "provider-network-error",
  "provider-rate-limited",
  "provider-server-error",
]);

const defaultSleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function generateWithTransientProviderRetries({
  input,
  generate,
  sleep = defaultSleep,
  retryDelays = TRANSIENT_PROVIDER_RETRY_DELAYS_MS,
}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await generate(input);
    } catch (error) {
      const delay = retryDelays[attempt];
      if (!transientProviderCodes.has(error?.code) || delay === undefined) {
        throw error;
      }
      await sleep(delay);
    }
  }
}

export async function generateValidatedEnrichment({
  initialInput,
  maxAttempts = 1,
  generate,
  validate,
  repair,
}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maximum enrichment attempts must be a positive integer");
  }
  let input = initialInput;
  let latest;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const generated = await generate(input);
    const validation = validate(generated.output);
    latest = { ...generated, validation };
    if (validation.valid || attempt === maxAttempts) return latest;
    input = repair(input, validation, generated.output);
  }
  throw new Error("enrichment attempt loop ended unexpectedly");
}
