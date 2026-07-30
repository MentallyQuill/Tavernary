import { validateCatalogCopyResult } from "./catalog-copy-contract.mjs";
import { validateTagGenerationOutput } from "./tag-classification.mjs";

const copyDiagnosticKeys = new Set([
  "result",
  "change_reasons",
  "policy_signal",
]);

function requestedFields(context) {
  return Array.isArray(context?.requestedFields)
    ? [...new Set(context.requestedFields)]
    : [];
}

function generationOutput(output, includesSummary) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return output;
  }
  return Object.fromEntries(
    Object.entries(output).filter(
      ([key]) => !includesSummary || !copyDiagnosticKeys.has(key),
    ),
  );
}

function copyErrors(output, context) {
  const summary =
    output?.summary &&
    typeof output.summary === "object" &&
    !Array.isArray(output.summary)
      ? output.summary.value
      : undefined;
  const validation = validateCatalogCopyResult(
    {
      summary,
      result: output?.result,
      change_reasons: output?.change_reasons,
      policy_signal: output?.policy_signal,
    },
    context?.copyContext ?? {
      mode: "synthesize",
      submittedSummary: "",
      protectedTerms: [],
    },
  );
  return validation.valid ? [] : validation.errors;
}

export function validateEnrichmentOutput(output, context) {
  const fields = requestedFields(context);
  const includesSummary = fields.includes("summary");
  const validation = validateTagGenerationOutput(
    generationOutput(output, includesSummary),
    {
      fields,
      vocabulary: context?.tagVocabulary,
      kind: context?.kind,
    },
  );
  const errors = validation.valid ? [] : [...validation.errors];

  if (includesSummary) {
    errors.push(...copyErrors(output, context));
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors: [...new Set(errors)] };
}
