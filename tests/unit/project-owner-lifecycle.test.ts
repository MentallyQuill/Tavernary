import { expect, test } from "vitest";

import { planProjectOwnerClosure } from "../../scripts/help/project-owner-lifecycle.mjs";

function markedOwnerBody(issueNumber: number) {
  return [
    "<!-- tavernary-project-owner-pr",
    JSON.stringify({
      schema_version: 1,
      issue_number: issueNumber,
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
    ],
    deleteBranch: "automation/project-owner-request-123",
    closeReason: "not_planned",
  });
});

test("cleans owner queue labels after a merged marked PR", () => {
  expect(planProjectOwnerClosure(closure({ merged: true }))).toEqual({
    action: "merged",
    issueNumber: 123,
    addLabels: [],
    removeLabels: [
      "needs-information",
      "needs-maintainer-review",
      "submission-retryable",
      "submission-pr-open",
    ],
    deleteBranch: "automation/project-owner-request-123",
    closeReason: null,
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
