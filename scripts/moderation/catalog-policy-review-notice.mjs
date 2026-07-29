const categoryLabels = {
  "potential-hate-or-discrimination": "Potential hate or discrimination",
  "potential-sexual-content-involving-minors":
    "Potential sexual content involving minors",
  "potential-other-catalog-policy-conflict":
    "Potential other Catalog Policy conflict",
};

function safe(value, limit = 400) {
  return String(value ?? "")
    .replace(/<!--/gu, "")
    .replace(/-->/gu, "")
    .replace(/@/gu, "&#64;")
    .replace(/[\u0000-\u001f\u007f<>]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, limit)
    .replace(/([[\]_*`#|])/gu, "\\$1");
}

function inert(value) {
  const encoded = JSON.stringify(String(value ?? ""))
    .replace(/@/gu, "\\u0040")
    .replace(/`/gu, "\\u0060");
  return `\`\`\`json\n${encoded}\n\`\`\``;
}

export function renderCatalogPolicyReviewIssue(input) {
  const marker = `<!-- tavernary-catalog-policy-review:${input.project.id} -->`;
  const reasons =
    input.copyReasons?.length > 0
      ? input.copyReasons.slice(0, 8).map((reason) => `- \`${safe(reason, 80)}\``)
      : ["- None."];
  return {
    title: `[Catalog policy advisory] ${safe(input.project.name, 180)}`,
    labels: ["catalog-policy-advisory"],
    body: [
      marker,
      "**Automated advisory only:** This issue is not a violation determination. No enforcement action was taken automatically.",
      "",
      `- **Project:** ${safe(input.project.name)} (\`${safe(input.project.id, 100)}\`)`,
      `- **Source:** ${safe(input.sourceUrl, 320)}`,
      `- **Category:** ${categoryLabels[input.output.category]}`,
      `- **Transaction issue:** #${input.transactionIssueNumber}`,
      `- **Merged PR:** #${input.transactionPullNumber}`,
      `- **Evidence fingerprint:** \`${safe(input.evidenceFingerprint, 80)}\``,
      `- **Policy version:** \`${safe(input.policyVersion, 80)}\``,
      `- **Reviewed at:** ${safe(input.reviewedAt, 80)}`,
      `- **Immutable README evidence:** ${safe(input.readmeUrl ?? "Unavailable", 500)}`,
      "",
      "## Exact submitted summary",
      "",
      inert(input.submittedSummary),
      "",
      "## Final published summary",
      "",
      inert(input.project.summary),
      "",
      "## Catalog-copy change categories",
      "",
      ...reasons,
      "",
      "## Advisory explanation",
      "",
      safe(input.output.explanation, 320),
    ].join("\n"),
  };
}
