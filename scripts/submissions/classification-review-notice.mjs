import { EXTENSION_PRIMARY_FUNCTION_IDS } from "../../src/features/catalog/primary-function-contract.mjs";

export const classificationReviewMarker =
  "<!-- tavernary-classification-review -->";
export const classificationReviewLabel = "classification-review";

const primaryFunctionLabels = Object.freeze({
  "memory-retrieval": "Memory and retrieval",
  "generation-reasoning": "Generation and reasoning",
  "character-worldbuilding": "Character and worldbuilding",
  "rpg-systems": "RPG systems and suites",
  "interface-workflow": "Interface and workflow",
  "developer-infrastructure": "Developer infrastructure",
});
const extensionPrimaryFunctions = new Set(EXTENSION_PRIMARY_FUNCTION_IDS);

function safeText(value, limit = 240) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit)
    .trimEnd();
  return normalized
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/@/gu, "&#64;")
    .replace(/\\/gu, "\\\\")
    .replace(/([[\]()*_`#|])/gu, "\\$1");
}

export function primaryFunctionLabel(id) {
  return primaryFunctionLabels[id] ?? id;
}

function mismatchReview(review) {
  return (
    review?.status === "possible-mismatch" &&
    extensionPrimaryFunctions.has(review.submitted_primary_function) &&
    extensionPrimaryFunctions.has(review.suggested_primary_function) &&
    review.submitted_primary_function !== review.suggested_primary_function &&
    typeof review.explanation === "string" &&
    review.explanation.trim().length > 0
  );
}

function renderMismatchComment(review) {
  const submittedId = review.submitted_primary_function;
  const suggestedId = review.suggested_primary_function;
  return [
    classificationReviewMarker,
    "### Possible primary-function mismatch",
    "",
    `The submitter selected **${primaryFunctionLabel(submittedId)}** (\`${submittedId}\`), while the optional intake review suggested **${primaryFunctionLabel(suggestedId)}** (\`${suggestedId}\`).`,
    "",
    `**Review reason:** ${safeText(review.explanation)}`,
    "",
    "This warning is non-blocking. The submitted value remains authoritative unless a maintainer edits the generated proposal during review.",
  ].join("\n");
}

export function planClassificationReviewNotice(input) {
  const currentLabels = new Set(input.currentLabels ?? []);
  const ownedComments = (input.comments ?? [])
    .filter(
      (comment) =>
        Number.isInteger(comment.id) &&
        typeof comment.body === "string" &&
        comment.body.includes(classificationReviewMarker),
    )
    .sort((left, right) => left.id - right.id);

  if (!mismatchReview(input.classificationReview)) {
    return {
      addLabels: [],
      removeLabels: currentLabels.has(classificationReviewLabel)
        ? [classificationReviewLabel]
        : [],
      comment: null,
      removeCommentIds: ownedComments.map(({ id }) => id),
    };
  }

  const body = renderMismatchComment(input.classificationReview);
  const canonicalComment = ownedComments[0];
  return {
    addLabels: currentLabels.has(classificationReviewLabel)
      ? []
      : [classificationReviewLabel],
    removeLabels: [],
    comment: canonicalComment
      ? canonicalComment.body === body
        ? null
        : { action: "update", commentId: canonicalComment.id, body }
      : { action: "create", body },
    removeCommentIds: ownedComments.slice(1).map(({ id }) => id),
  };
}
