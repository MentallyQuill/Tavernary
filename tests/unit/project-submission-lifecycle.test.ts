import { expect, test } from "vitest";

import { planProjectSubmissionClosure } from "../../scripts/submissions/project-submission-lifecycle.mjs";

function markedBody(issueNumber: number) {
  return [
    "<!-- tavernary-project-submission-pr",
    JSON.stringify({
      schema_version: 1,
      issue_number: issueNumber,
      generated_head_sha: "a".repeat(40),
      generated_paths: [`data/registry/projects/project-${issueNumber}.json`],
    }),
    "-->",
    `Closes #${issueNumber}`,
  ].join("\n");
}

test("declines a marked generated PR closed without merge", () => {
  expect(
    planProjectSubmissionClosure({
      merged: false,
      headRef: "automation/project-submission-123",
      headRepository: "Tavernary/Tavernary",
      baseRepository: "Tavernary/Tavernary",
      body: markedBody(123),
    }),
  ).toEqual({
    action: "decline",
    issueNumber: 123,
    addLabels: ["submission-declined"],
    removeLabels: ["needs-maintainer-review", "submission-pr-open"],
    closeReason: "not_planned",
    deleteBranch: "automation/project-submission-123",
    retryForkDependents: true,
  });
});

test("cleans labels and branch after a merged generated PR", () => {
  expect(
    planProjectSubmissionClosure({
      merged: true,
      headRef: "automation/project-submission-123",
      headRepository: "Tavernary/Tavernary",
      baseRepository: "Tavernary/Tavernary",
      body: markedBody(123),
    }),
  ).toEqual({
    action: "merged",
    issueNumber: 123,
    addLabels: [],
    removeLabels: ["needs-maintainer-review", "submission-pr-open"],
    closeReason: null,
    deleteBranch: "automation/project-submission-123",
    retryForkDependents: true,
  });
});

test("ignores an unmarked pull request", () => {
  expect(
    planProjectSubmissionClosure({
      merged: false,
      headRef: "feature/example",
      headRepository: "Tavernary/Tavernary",
      baseRepository: "Tavernary/Tavernary",
      body: "Closes #123",
    }),
  ).toEqual({ action: "ignore" });
});

test("ignores a marker that does not own the pull request branch", () => {
  expect(
    planProjectSubmissionClosure({
      merged: false,
      headRef: "automation/project-submission-124",
      headRepository: "Tavernary/Tavernary",
      baseRepository: "Tavernary/Tavernary",
      body: markedBody(123),
    }),
  ).toEqual({ action: "ignore" });
});

test("ignores a fork branch impersonating generated submission state", () => {
  expect(
    planProjectSubmissionClosure({
      merged: false,
      headRef: "automation/project-submission-123",
      headRepository: "attacker/fork",
      baseRepository: "Tavernary/Tavernary",
      body: markedBody(123),
    }),
  ).toEqual({ action: "ignore" });
});

export { markedBody };
