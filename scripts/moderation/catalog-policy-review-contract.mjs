import { createHash } from "node:crypto";

export const CATALOG_POLICY_REVIEW_CATEGORIES = Object.freeze([
  "potential-hate-or-discrimination",
  "potential-sexual-content-involving-minors",
  "potential-other-catalog-policy-conflict",
]);
const statuses = new Set([
  "clear",
  "review-suggested",
  "review-unavailable",
]);
const categories = new Set(CATALOG_POLICY_REVIEW_CATEGORIES);
const exactKeys = new Set(["status", "category", "explanation"]);

export function createPolicyEvidenceFingerprint(input) {
  const serialized = JSON.stringify({
    project_id: input?.projectId,
    source_identity: input?.sourceIdentity,
    head_sha: input?.headSha,
    policy_version: input?.policyVersion,
  });
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

export function validateCatalogPolicyReviewOutput(output) {
  if (
    !output ||
    typeof output !== "object" ||
    Array.isArray(output) ||
    Object.keys(output).length !== exactKeys.size ||
    Object.keys(output).some((key) => !exactKeys.has(key)) ||
    !statuses.has(output.status)
  ) {
    return { valid: false, errors: ["Review output shape is invalid."] };
  }
  if (output.status === "review-suggested") {
    if (
      !categories.has(output.category) ||
      typeof output.explanation !== "string" ||
      output.explanation.trim() !== output.explanation ||
      output.explanation.length < 1 ||
      output.explanation.length > 320 ||
      /[\u0000-\u001f\u007f<>]/u.test(output.explanation)
    ) {
      return {
        valid: false,
        errors: ["Suggested review category or explanation is invalid."],
      };
    }
  } else if (output.category !== null || output.explanation !== null) {
    return {
      valid: false,
      errors: ["Non-suggested review output must not contain review details."],
    };
  }
  return {
    valid: true,
    value: {
      status: output.status,
      category: output.category,
      explanation: output.explanation,
    },
  };
}
