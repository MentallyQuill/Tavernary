import {
  parseSubmissionPullRequestMarker,
  submissionBranch,
} from "./project-submission-pr.mjs";

const removableLabels = [
  "needs-maintainer-review",
  "submission-pr-open",
  "submission-retryable",
];

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
