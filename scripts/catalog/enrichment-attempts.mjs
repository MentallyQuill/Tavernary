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
