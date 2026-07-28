import {
  ownerRequestBranch,
  parseOwnerRequestPullRequestMarker,
} from "./project-owner-pr.mjs";

const removableLabels = [
  "needs-information",
  "needs-maintainer-review",
  "submission-retryable",
  "submission-pr-open",
];

export function planProjectOwnerClosure(input) {
  const marker = parseOwnerRequestPullRequestMarker(input.body ?? "");
  if (
    !marker ||
    input.headRepository.toLowerCase() !== input.baseRepository.toLowerCase() ||
    input.headRef !== ownerRequestBranch(marker.issue_number) ||
    input.baseRef !== input.defaultBranch ||
    input.headSha !== marker.generated_head_sha
  ) {
    return { action: "ignore" };
  }
  const common = {
    issueNumber: marker.issue_number,
    removeLabels: removableLabels,
    deleteBranch: input.headRef,
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
