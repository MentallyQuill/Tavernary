import { expect, test } from "vitest";

import {
  isSafeProjectPublicationBaseDrift,
  planProjectPublication,
} from "../../scripts/publication/project-publication-planner.mjs";
import { createProjectPublicationTransaction } from "../../scripts/publication/project-publication-transaction.mjs";

const headSha = "c".repeat(40);
const baseSha = "b".repeat(40);
const transaction = createProjectPublicationTransaction({
  schema_version: 2,
  operation: "create",
  producer: "project-submission",
  publication_mode: "automatic",
  issue_number: 72,
  project_ids: ["owner-project"],
  source_id: "github-42",
  source_identity: {
    type: "github",
    canonical: "github:42",
    repository_id: 42,
  },
  actor: { id: 11, login: "Submitter", type: "User" },
  authority_type: "community-submitter",
  input_digest: "a".repeat(64),
  input_fingerprints: { projects: {}, source: null },
  base_sha: baseSha,
  generated_head_sha: headSha,
  generated_paths: [
    "data/registry/projects/owner-project.json",
    "data/registry/sources/github-42.json",
    "data/snapshots/github/github-42.json",
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
      baseDriftSafe: true,
      inputDigest: transaction.input_digest,
      projectFingerprints: {},
      sourceFingerprint: null,
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
    projectIds: ["owner-project"],
    sourceId: "github-42",
  });
});

test("merges when main advances without touching generated transaction paths", () => {
  expect(
    planProjectPublication(
      input({
        current: {
          ...input().current,
          mainSha: "e".repeat(40),
          baseDriftSafe: true,
        },
      }),
    ),
  ).toMatchObject({ action: "merge", pullNumber: 73 });
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
  ["base-behind-main", { mainSha: "e".repeat(40), baseDriftSafe: false }],
  [
    "project-fingerprint-stale",
    { projectFingerprints: { "owner-project": "f".repeat(64) } },
  ],
] as const)("regenerates %s state", (reasonCode, currentOverride) => {
  const ownerTransaction = createProjectPublicationTransaction({
    ...transaction,
    operation: "edit-card",
    producer: "project-owner-request",
    authority_type: "repository-owner",
    input_fingerprints: {
      projects: { "owner-project": "9".repeat(64) },
      source: null,
    },
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
      projectFingerprints: {
        "owner-project":
          ownerTransaction.input_fingerprints.projects["owner-project"],
      },
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

test("allows only disjoint generated data and report artifacts as safe base drift", () => {
  expect(
    isSafeProjectPublicationBaseDrift({
      transaction,
      changedPaths: [
        "data/registry/projects/another-project.json",
        "data/registry/sources/github-99.json",
        "data/registry/kits/another-kit.json",
        "data/snapshots/github/github-99.json",
        "data/snapshots/install/github-99.json",
        "data/snapshots/github/kits/another-kit.json",
        "data/security/tavernkeeper-report-summaries.json",
        "public/catalog/tavernary-catalog-v8.json",
        "public/catalog/tavernary-catalog.json",
      ],
    }),
  ).toBe(true);
  expect(
    isSafeProjectPublicationBaseDrift({
      transaction,
      changedPaths: [transaction.generated_paths[0]],
    }),
  ).toBe(false);
  expect(
    isSafeProjectPublicationBaseDrift({
      transaction,
      changedPaths: [".github/workflows/ci.yml"],
    }),
  ).toBe(false);
  expect(
    isSafeProjectPublicationBaseDrift({
      transaction,
      changedPaths: ["data/vocabularies/frontends.json"],
    }),
  ).toBe(false);
});

test("holds a valid manual transaction for deliberate maintainer approval", () => {
  const manual = createProjectPublicationTransaction({
    ...transaction,
    operation: "add-cards",
    producer: "project-owner-request",
    publication_mode: "manual",
    project_ids: ["card-a", "card-b"],
    authority_type: "repository-owner",
    input_fingerprints: { projects: {}, source: "9".repeat(64) },
    generated_paths: [
      "data/registry/projects/card-a.json",
      "data/registry/projects/card-b.json",
    ],
    copy_result: null,
  });
  expect(
    planProjectPublication(
      input({
        workflowRun: {
          ...input().workflowRun,
          head_branch: "automation/project-owner-request-72",
        },
        pull: {
          ...input().pull,
          mergeable: null,
          head: {
            ...input().pull.head,
            ref: "automation/project-owner-request-72",
          },
        },
        transaction: manual,
        issue: {
          ...input().issue,
          labels: [
            { name: "issue-admitted" },
            { name: "project-owner-request" },
            { name: "submission-pr-open" },
          ],
        },
        changedPaths: manual.generated_paths,
        current: {
          ...input().current,
          sourceFingerprint: "9".repeat(64),
        },
      }),
    ),
  ).toEqual({
    action: "await-maintainer",
    reasonCode: "manual-approval-required",
    producer: "project-owner-request",
    issueNumber: 72,
    projectIds: ["card-a", "card-b"],
    sourceId: "github-42",
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
