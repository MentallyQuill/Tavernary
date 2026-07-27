import {
  parseSubmissionPullRequestMarker,
  submissionBranch,
} from "./project-submission-pr.mjs";

const removableLabels = ["needs-maintainer-review", "submission-pr-open"];

export function planProjectSubmissionClosure(input) {
  const marker = parseSubmissionPullRequestMarker(input.body ?? "");
  if (
    !marker ||
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
      closeReason: null,
    };
  }
  return {
    action: "decline",
    ...common,
    addLabels: ["submission-declined"],
    closeReason: "not_planned",
  };
}
