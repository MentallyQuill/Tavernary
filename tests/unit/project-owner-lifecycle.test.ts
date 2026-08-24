import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";

import {
  planProjectOwnerClosure,
  terminalProjectValidationComment,
} from "../../scripts/help/project-owner-lifecycle.mjs";
import {
  createProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../../scripts/publication/project-publication-transaction.mjs";

function markedOwnerBody(issueNumber: number) {
  const transaction = createProjectPublicationTransaction({
    schema_version: 2,
    operation: "edit-card",
    producer: "project-owner-request",
    publication_mode: "automatic",
    issue_number: issueNumber,
    project_ids: ["owner-alpha"],
    source_id: "github-42",
    source_identity: {
      type: "github",
      canonical: "github:42",
      repository_id: 42,
    },
    actor: { id: 11, login: "Owner", type: "User" },
    authority_type: "repository-owner",
    input_digest: "d".repeat(64),
    input_fingerprints: {
      projects: { "owner-alpha": "e".repeat(64) },
      source: null,
    },
    base_sha: "b".repeat(40),
    generated_head_sha: "a".repeat(40),
    generated_paths: ["data/registry/projects/owner-alpha.json"],
    policy_version: "2026-07-29",
    copy_result: null,
  });
  return [
    PROJECT_PUBLICATION_TRANSACTION_MARKER,
    JSON.stringify(transaction),
    "-->",
  ].join("\n");
}

function closure(overrides: Record<string, unknown> = {}) {
  return {
    merged: false,
    headRef: "automation/project-owner-request-123",
    headRepository: "MentallyQuill/Tavernary",
    baseRepository: "MentallyQuill/Tavernary",
    baseRef: "main",
    defaultBranch: "main",
    headSha: "a".repeat(40),
    body: markedOwnerBody(123),
    ...overrides,
  };
}

test("declines an unmerged marked owner PR", () => {
  expect(planProjectOwnerClosure(closure())).toMatchObject({
    action: "decline",
    issueNumber: 123,
    addLabels: ["submission-declined"],
    removeLabels: [
      "needs-information",
      "needs-maintainer-review",
      "submission-retryable",
      "submission-pr-open",
      "submission-validation-retrying",
      "submission-validation-blocked",
    ],
    deleteBranch: "automation/project-owner-request-123",
    closeReason: "not_planned",
  });
});

test("closes the owner issue after a merged marked PR", () => {
  expect(planProjectOwnerClosure(closure({ merged: true }))).toEqual({
    action: "merged",
    issueNumber: 123,
    addLabels: [],
    removeLabels: [
      "needs-information",
      "needs-maintainer-review",
      "submission-retryable",
      "submission-pr-open",
      "submission-validation-retrying",
      "submission-validation-blocked",
    ],
    deleteBranch: "automation/project-owner-request-123",
    closeReason: "completed",
  });
});

test.each([
  {
    name: "unmarked PR",
    overrides: { body: "Closes #123" },
  },
  {
    name: "fork PR",
    overrides: { headRepository: "attacker/Tavernary" },
  },
  {
    name: "unrelated branch",
    overrides: { headRef: "feature/project-owner-request-123" },
  },
  {
    name: "different issue branch",
    overrides: { headRef: "automation/project-owner-request-999" },
  },
  {
    name: "retargeted base branch",
    overrides: { baseRef: "release" },
  },
  {
    name: "stale generated-head marker",
    overrides: { headSha: "b".repeat(40) },
  },
])("ignores $name", ({ overrides }) => {
  expect(planProjectOwnerClosure(closure(overrides))).toEqual({
    action: "ignore",
  });
});

test("fails closed on a schema-version-1 generated owner PR", () => {
  const legacy = [
    "<!-- tavernary-project-owner-pr",
    JSON.stringify({
      schema_version: 1,
      issue_number: 123,
      project_id: "owner-alpha",
      operation: "edit-card",
      repository_id: 42,
      authority_type: "repository-owner",
      actor_login: "Owner",
      generated_head_sha: "a".repeat(40),
      generated_paths: ["data/registry/projects/owner-alpha.json"],
    }),
    "-->",
  ].join("\n");
  expect(planProjectOwnerClosure(closure({ body: legacy }))).toEqual({
    action: "ignore",
  });
});

test("projects terminal state only onto the immutable Actions marker", async () => {
  const source = await readFile(
    resolve(".github/workflows/project-owner-request-lifecycle.yml"),
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

test("preserves terminal owner marker history and skips an identical retry", () => {
  const current = [
    "<!-- tavernary-project-validation-state",
    JSON.stringify({
      schema_version: 1,
      status: "published",
      head_sha: "a".repeat(40),
      attempts: 2,
      run_id: 654,
    }),
    "-->",
    "Publisher completed; Tavernary is waiting for the issue lifecycle to close.",
  ].join("\n");

  const terminal = terminalProjectValidationComment({
    existingBody: current,
    action: "merged",
    headSha: "a".repeat(40),
  });

  expect(terminal).toContain('"status":"merged"');
  expect(terminal).toContain('"attempts":2');
  expect(terminal).toContain('"run_id":654');
  expect(
    terminalProjectValidationComment({
      existingBody: terminal,
      action: "merged",
      headSha: "a".repeat(40),
    }),
  ).toBeNull();
});
