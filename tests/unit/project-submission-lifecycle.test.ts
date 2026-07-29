import { expect, test } from "vitest";

import { planProjectSubmissionClosure } from "../../scripts/submissions/project-submission-lifecycle.mjs";
import {
  createProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../../scripts/publication/project-publication-transaction.mjs";

function markedBody(issueNumber: number) {
  const transaction = createProjectPublicationTransaction({
    schema_version: 2,
    operation: "create",
    producer: "project-submission",
    publication_mode: "automatic",
    issue_number: issueNumber,
    project_ids: [`project-${issueNumber}`],
    source_id: "github-42",
    source_identity: {
      type: "github",
      canonical: "github:42",
      repository_id: 42,
    },
    actor: { id: 11, login: "Submitter", type: "User" },
    authority_type: "community-submitter",
    input_digest: "d".repeat(64),
    input_fingerprints: { projects: {}, source: null },
    base_sha: "b".repeat(40),
    generated_head_sha: "a".repeat(40),
    generated_paths: [
      `data/registry/projects/project-${issueNumber}.json`,
      "data/registry/sources/github-42.json",
      "data/snapshots/github/github-42.json",
    ],
    policy_version: "2026-07-29",
    copy_result: null,
  });
  return [
    PROJECT_PUBLICATION_TRANSACTION_MARKER,
    JSON.stringify(transaction),
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
