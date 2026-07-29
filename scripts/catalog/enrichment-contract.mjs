import { validateCatalogCopyResult } from "./catalog-copy-contract.mjs";

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

function summaryErrors(summary, summaryMode) {
  if (typeof summary !== "string" || summary.trim().length === 0) {
    return ["summary must be a non-empty string"];
  }

  if (summary === FALLBACK_SUMMARY) return [];

  const errors = [];
  if (summary.length > 220)
    errors.push("summary must be 220 characters or fewer");
  if (
    summaryMode === "synthesize" &&
    (wordCount(summary) < 24 || wordCount(summary) > 36)
  ) {
    errors.push("summary must contain between 24 and 36 words");
  }
  if (/[\r\n\u2028\u2029]/u.test(summary))
    errors.push("summary must not contain line breaks");
  if (/```|`|[*_#[\]>]|^\s*(?:[-*+]\s|\d+[.)]\s)/mu.test(summary)) {
    errors.push("summary must not contain markdown or list syntax");
  }

  const endings = summary.match(/[.!?](?=\s|$)/gu) ?? [];
  if (
    summaryMode === "synthesize" &&
    (endings.length !== 2 || !/[.!?]$/u.test(summary.trim()))
  ) {
    errors.push("summary must be exactly two sentences");
  }

  return errors;
}

function classificationReviewErrors(review, request) {
  if (!request) {
    return review === null
      ? []
      : ["classification_review must be null when no review was requested"];
  }
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    return [
      "classification_review must be an object when review was requested",
    ];
  }

  const errors = [];
  const allowedPrimaryFunctions = request.allowedPrimaryFunctions ?? [];
  if (!["confirmed", "possible-mismatch"].includes(review.status)) {
    errors.push("classification_review status is invalid");
  }
  if (
    !vocabularyIncludes(
      allowedPrimaryFunctions,
      review.suggested_primary_function,
    )
  ) {
    errors.push(
      "classification_review suggested_primary_function is not allowed",
    );
  }
  if (review.status === "confirmed") {
    if (
      review.suggested_primary_function !== request.submittedPrimaryFunction
    ) {
      errors.push(
        "confirmed classification_review must repeat the submitted primary function",
      );
    }
    if (review.explanation !== null) {
      errors.push("confirmed classification_review explanation must be null");
    }
  }
  if (review.status === "possible-mismatch") {
    if (
      review.suggested_primary_function === request.submittedPrimaryFunction
    ) {
      errors.push(
        "possible-mismatch classification_review must suggest a different primary function",
      );
    }
    if (
      typeof review.explanation !== "string" ||
      review.explanation.trim().length === 0 ||
      review.explanation.length > 240
    ) {
      errors.push(
        "possible-mismatch classification_review explanation must contain 1-240 characters",
      );
    }
  }
  return errors;
}

export function validateEnrichmentOutput(
  output,
  vocabularies,
  classificationReviewRequest = null,
  copyContext = {
    mode: "synthesize",
    submittedSummary: "",
    protectedTerms: [],
  },
) {
  const errors = [];
  errors.push(...summaryErrors(output?.summary, copyContext.mode));
  const copyValidation = validateCatalogCopyResult(
    {
      summary: output?.summary,
      result: output?.result,
      change_reasons: output?.change_reasons,
      policy_signal: output?.policy_signal,
    },
    copyContext,
  );
  if (!copyValidation.valid) errors.push(...copyValidation.errors);

  if (output?.metadata_status !== "curated") {
    errors.push("metadata_status must be curated");
  }

  if (
    output &&
    typeof output === "object" &&
    Object.hasOwn(output, "primary_function")
  ) {
    errors.push("primary_function is not allowed in enrichment output");
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

  errors.push(
    ...classificationReviewErrors(
      output?.classification_review,
      classificationReviewRequest,
    ),
  );

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
