import { expect, test } from "vitest";

import { planProjectOwnerClosure } from "../../scripts/help/project-owner-lifecycle.mjs";
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
