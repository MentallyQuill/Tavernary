const FALLBACK_SUMMARY = "No README file found.";

function wordCount(value) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function vocabularyIncludes(vocabulary, value) {
  return vocabulary instanceof Set
    ? vocabulary.has(value)
    : Array.isArray(vocabulary) &&
        vocabulary.some((entry) =>
          typeof entry === "string" ? entry === value : entry?.id === value,
        );
}

function summaryErrors(summary) {
  if (typeof summary !== "string" || summary.trim().length === 0) {
    return ["summary must be a non-empty string"];
  }

  if (summary === FALLBACK_SUMMARY) return [];

  const errors = [];
  if (summary.length > 140)
    errors.push("summary must be 140 characters or fewer");
  if (wordCount(summary) < 12 || wordCount(summary) > 24) {
    errors.push("summary must contain between 12 and 24 words");
  }
  if (/[\r\n\u2028\u2029]/u.test(summary))
    errors.push("summary must not contain line breaks");
  if (/```|`|[*_#[\]>]|^\s*(?:[-*+]\s|\d+[.)]\s)/mu.test(summary)) {
    errors.push("summary must not contain markdown or list syntax");
  }

  const endings = summary.match(/[.!?](?=\s|$)/gu) ?? [];
  if (endings.length !== 1 || !/[.!?]$/u.test(summary.trim())) {
    errors.push("summary must be exactly one sentence");
  }

  return errors;
}

export function validateEnrichmentOutput(output, vocabularies) {
  const errors = [];
  errors.push(...summaryErrors(output?.summary));

  if (output?.metadata_status !== "curated") {
    errors.push("metadata_status must be curated");
  }

  if (
    !vocabularyIncludes(
      vocabularies?.primaryFunctions,
      output?.primary_function,
    )
  ) {
    errors.push("primary_function is not in the controlled vocabulary");
  }

  if (!Array.isArray(output?.capabilities)) {
    errors.push("capabilities must be an array");
  } else {
    for (const capability of output.capabilities) {
      if (!vocabularyIncludes(vocabularies.capabilities, capability)) {
        errors.push(
          `capabilities contains an unknown controlled vocabulary ID: ${capability}`,
        );
      }
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
