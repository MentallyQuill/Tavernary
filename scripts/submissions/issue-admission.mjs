export const OPEN_ISSUE_LIMIT = 10;
export const ISSUE_ADMISSION_LABEL = "issue-admitted";
export const ISSUE_LIMIT_LABEL = "issue-limit-reached";
export const ISSUE_LIMIT_MARKER = "<!-- tavernary-open-issue-limit -->";

const trustedAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export function decideIssueAdmission({
  currentIssue,
  openItems,
  authorAssociation,
}) {
  if (trustedAssociations.has(authorAssociation)) {
    return {
      admitted: true,
      reason: "trusted",
      openIssueCount: 0,
      admittedIssueNumbers: [],
    };
  }

  const authorIssues = openItems
    .filter(
      (item) => !item.pull_request && item.user?.id === currentIssue.user?.id,
    )
    .sort(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) ||
        left.number - right.number,
    );
  const admittedIssueNumbers = authorIssues
    .slice(0, OPEN_ISSUE_LIMIT)
    .map((item) => item.number);
  const admitted = admittedIssueNumbers.includes(currentIssue.number);

  return {
    admitted,
    reason: admitted ? "within-limit" : "over-limit",
    openIssueCount: authorIssues.length,
    admittedIssueNumbers,
  };
}

export function buildIssueLimitComment() {
  return [
    ISSUE_LIMIT_MARKER,
    "Tavernary keeps at most 10 issues open per external GitHub account at one time.",
    "",
    "This issue was closed because this account already has 10 older open issues. Close or resolve one of those issues, then reopen this issue to use the available slot.",
  ].join("\n");
}
