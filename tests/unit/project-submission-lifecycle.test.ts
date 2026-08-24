import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";

import {
  planProjectSubmissionClosure,
  terminalProjectValidationComment,
} from "../../scripts/submissions/project-submission-lifecycle.mjs";
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
    removeLabels: [
      "needs-maintainer-review",
      "submission-pr-open",
      "submission-retryable",
      "submission-validation-retrying",
      "submission-validation-blocked",
    ],
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
    removeLabels: [
      "needs-maintainer-review",
      "submission-pr-open",
      "submission-retryable",
      "submission-validation-retrying",
      "submission-validation-blocked",
    ],
    closeReason: "completed",
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

test("projects terminal state only onto the immutable Actions marker", async () => {
  const source = await readFile(
    resolve(".github/workflows/project-submission-lifecycle.yml"),
    "utf8",
  );

  expect(source).toContain('gh api "/users/github-actions%5Bbot%5D"');
  expect(source).toContain("comment.user?.id === botId");
  expect(source).toContain("tavernary-project-validation-state");
  expect(source).toContain("terminalProjectValidationComment");
  expect(source).toContain("const body = terminalProjectValidationComment({");
  expect(source).toContain("if (body !== null)");
  expect(source).toContain("gh api --method PATCH");
});

test("preserves terminal submission marker history and skips an identical retry", () => {
  const current = [
    "<!-- tavernary-project-validation-state",
    JSON.stringify({
      schema_version: 1,
      status: "published",
      head_sha: "a".repeat(40),
      attempts: 3,
      run_id: 987,
    }),
    "-->",
    "Publisher completed; Tavernary is waiting for the issue lifecycle to close.",
  ].join("\n");

  const terminal = terminalProjectValidationComment({
    existingBody: current,
    action: "decline",
    headSha: "a".repeat(40),
  });

  expect(terminal).toContain('"status":"declined"');
  expect(terminal).toContain('"attempts":3');
  expect(terminal).toContain('"run_id":987');
  expect(
    terminalProjectValidationComment({
      existingBody: terminal,
      action: "decline",
      headSha: "a".repeat(40),
    }),
  ).toBeNull();
});

export { markedBody };
