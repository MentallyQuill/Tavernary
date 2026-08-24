import {
  parseSubmissionPullRequestMarker,
  submissionBranch,
} from "./project-submission-pr.mjs";

const removableLabels = [
  "needs-maintainer-review",
  "submission-pr-open",
  "submission-retryable",
  "submission-validation-retrying",
  "submission-validation-blocked",
];
const validationStateMarker = "<!-- tavernary-project-validation-state";

export function terminalProjectValidationComment({
  existingBody,
  action,
  headSha,
}) {
  const terminalState =
    action === "merged" ? "merged" : action === "decline" ? "declined" : null;
  const prior = String(existingBody ?? "");
  const markerIndex = prior.indexOf(validationStateMarker);
  if (!terminalState || markerIndex < 0) return null;

  const markerPayload = prior
    .slice(markerIndex + validationStateMarker.length)
    .split("\n-->\n", 1)[0]
    .trim();
  let previousState = {};
  try {
    const parsed = JSON.parse(markerPayload);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      previousState = parsed;
    }
  } catch {}

  const body = `${validationStateMarker}\n${JSON.stringify({
    schema_version: 1,
    status: terminalState,
    head_sha: headSha,
    attempts: Number.isSafeInteger(previousState.attempts)
      ? previousState.attempts
      : 0,
    run_id: previousState.run_id ?? null,
  })}\n-->\n${
    terminalState === "merged"
      ? "Tavernary completed this generated transaction."
      : "Tavernary declined this generated transaction."
  }`;
  return prior === body ? null : body;
}

export function planProjectSubmissionClosure(input) {
  const marker = parseSubmissionPullRequestMarker(input.body ?? "");
  if (
    marker?.schema_version !== 2 ||
    marker.producer !== "project-submission" ||
    input.headRepository.toLowerCase() !== input.baseRepository.toLowerCase() ||
    input.headRef !== submissionBranch(marker.issue_number)
  ) {
    return { action: "ignore" };
  }
  const common = {
    issueNumber: marker.issue_number,
    removeLabels: removableLabels,
    deleteBranch: input.headRef,
    retryForkDependents: true,
  };
  if (input.merged) {
    return {
      action: "merged",
      ...common,
      addLabels: [],
      closeReason: "completed",
    };
  }
  return {
    action: "decline",
    ...common,
    addLabels: ["submission-declined"],
    closeReason: "not_planned",
  };
}
