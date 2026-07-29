import { expect, test } from "vitest";

import { planProjectPublication } from "../../scripts/publication/project-publication-planner.mjs";
import { createProjectPublicationTransaction } from "../../scripts/publication/project-publication-transaction.mjs";

const headSha = "c".repeat(40);
const baseSha = "b".repeat(40);
const transaction = createProjectPublicationTransaction({
  operation: "create",
  producer: "project-submission",
  issue_number: 72,
  project_id: "owner-project",
  source_identity: {
    type: "github",
    canonical: "github:42",
    repository_id: 42,
  },
  actor: { id: 11, login: "Submitter", type: "User" },
  authority_type: "community-submitter",
  input_digest: "a".repeat(64),
  record_fingerprint: null,
  base_sha: baseSha,
  generated_head_sha: headSha,
  generated_paths: [
    "data/registry/projects/owner-project.json",
    "data/snapshots/github/owner-project.json",
  ],
  policy_version: "2026-07-29",
  copy_result: null,
});

function input(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    workflowRun: {
      name: "Site: Validate changes",
      event: "workflow_dispatch",
      conclusion: "success",
      head_sha: headSha,
      head_branch: "automation/project-submission-72",
    },
    repository: "Tavernary/Tavernary",
    defaultBranch: "main",
    pull: {
      number: 73,
      state: "open",
      mergeable: true,
      head: {
        sha: headSha,
        ref: "automation/project-submission-72",
        repo: { full_name: "Tavernary/Tavernary" },
      },
      base: { ref: "main" },
    },
    transaction,
    issue: {
      number: 72,
      state: "open",
      labels: [
        { name: "issue-admitted" },
        { name: "project-submission" },
        { name: "submission-pr-open" },
      ],
    },
    changedPaths: transaction.generated_paths,
    current: {
      mainSha: baseSha,
      inputDigest: transaction.input_digest,
      recordFingerprint: null,
      authorityValid: true,
      sourceIdentityValid: true,
    },
    ...overrides,
  };
}

test("merges a successful exact generated transaction", () => {
  expect(planProjectPublication(input())).toEqual({
    action: "merge",
    pullNumber: 73,
    expectedHeadSha: headSha,
    producer: "project-submission",
    issueNumber: 72,
    projectId: "owner-project",
  });
});

test.each([undefined, false])("pauses when the switch is %s", (enabled) => {
  expect(planProjectPublication(input({ enabled }))).toMatchObject({
    action: "paused",
  });
});

test("ignores ordinary branches and mismatched workflow heads", () => {
  expect(
    planProjectPublication(
      input({
        workflowRun: {
          ...input().workflowRun,
          head_branch: "feature/human",
        },
      }),
    ),
  ).toEqual({ action: "ignore" });
  expect(
    planProjectPublication(
      input({
        workflowRun: { ...input().workflowRun, head_sha: "d".repeat(40) },
      }),
    ),
  ).toEqual({ action: "ignore" });
});

test("retries unsuccessful or pending mergeability checks", () => {
  expect(
    planProjectPublication(
      input({
        workflowRun: { ...input().workflowRun, conclusion: "failure" },
      }),
    ),
  ).toMatchObject({ action: "retry", reasonCode: "ci-failed" });
  expect(
    planProjectPublication(
      input({ pull: { ...input().pull, mergeable: null } }),
    ),
  ).toMatchObject({ action: "retry", reasonCode: "mergeability-pending" });
});

test.each([
  ["input-digest-stale", { inputDigest: "d".repeat(64) }],
  ["base-behind-main", { mainSha: "e".repeat(40) }],
  ["record-fingerprint-stale", { recordFingerprint: "f".repeat(64) }],
] as const)("regenerates %s state", (reasonCode, currentOverride) => {
  const ownerTransaction = createProjectPublicationTransaction({
    ...transaction,
    operation: "edit-card",
    producer: "project-owner-request",
    authority_type: "repository-owner",
    record_fingerprint: "9".repeat(64),
    generated_paths: ["data/registry/projects/owner-project.json"],
    copy_result: {
      mode: "preserve",
      result: "accepted-with-policy-rewrite",
      change_reasons: ["slur-removed"],
      policy_signal: "catalog-policy-rewrite",
    },
  });
  const ownerInput = input({
    workflowRun: {
      ...input().workflowRun,
      head_branch: "automation/project-owner-request-72",
    },
    pull: {
      ...input().pull,
      head: {
        ...input().pull.head,
        ref: "automation/project-owner-request-72",
      },
    },
    transaction: ownerTransaction,
    issue: {
      ...input().issue,
      labels: [
        { name: "issue-admitted" },
        { name: "project-owner-request" },
        { name: "submission-pr-open" },
      ],
    },
    changedPaths: ownerTransaction.generated_paths,
    current: {
      ...input().current,
      recordFingerprint: ownerTransaction.record_fingerprint,
      ...currentOverride,
    },
  });
  expect(planProjectPublication(ownerInput)).toMatchObject({
    action: "regenerate",
    reasonCode,
    producer: "project-owner-request",
    issueNumber: 72,
  });
});

test("rejects lost authority and changed paths", () => {
  expect(
    planProjectPublication(
      input({
        current: { ...input().current, authorityValid: false },
      }),
    ),
  ).toMatchObject({ action: "reject", reasonCode: "authority-lost" });
  expect(
    planProjectPublication(
      input({
        changedPaths: ["data/registry/projects/other.json"],
      }),
    ),
  ).toMatchObject({ action: "reject", reasonCode: "path-mismatch" });
});

test("policy rewrites remain mergeable", () => {
  const policyTransaction = createProjectPublicationTransaction({
    ...transaction,
    authority_type: "repository-owner",
    copy_result: {
      mode: "preserve",
      result: "accepted-with-policy-rewrite",
      change_reasons: ["slur-removed"],
      policy_signal: "catalog-policy-rewrite",
    },
  });
  expect(
    planProjectPublication(input({ transaction: policyTransaction })),
  ).toMatchObject({ action: "merge" });
});
