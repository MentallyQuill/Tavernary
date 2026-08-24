import { expect, test } from "vitest";

import {
  PROJECT_VALIDATION_HANDOFF_GRACE_MS,
  PROJECT_VALIDATION_REGENERATION_GRACE_MS,
  PROJECT_VALIDATION_RETRY_LIMIT,
  projectValidationStateComment,
  planProjectValidationReconciliation,
} from "../../scripts/submissions/project-validation-reconciliation.mjs";
import { createProjectPublicationTransaction } from "../../scripts/publication/project-publication-transaction.mjs";

const HEAD_SHA = "c".repeat(40);
const OLD_HEAD_SHA = "d".repeat(40);
const NOW = Date.parse("2026-08-23T12:00:00.000Z");

const automaticTransaction = createProjectPublicationTransaction({
  schema_version: 2,
  operation: "create",
  producer: "project-submission",
  publication_mode: "automatic",
  issue_number: 620,
  project_ids: ["example-project"],
  source_id: "github-42",
  source_identity: {
    type: "github",
    canonical: "github:42",
    repository_id: 42,
  },
  actor: { id: 1, login: "submitter", type: "User" },
  authority_type: "community-submitter",
  input_digest: "a".repeat(64),
  input_fingerprints: { projects: {}, source: null },
  base_sha: "b".repeat(40),
  generated_head_sha: HEAD_SHA,
  generated_paths: [
    "data/registry/projects/example-project.json",
    "data/registry/sources/github-42.json",
    "data/snapshots/github/github-42.json",
  ],
  policy_version: "2026-08-23",
  copy_result: null,
});

function run(
  id: number,
  conclusion: string | null,
  options: Record<string, unknown> = {},
) {
  return {
    id,
    head_sha: HEAD_SHA,
    status: conclusion === null ? "in_progress" : "completed",
    conclusion,
    created_at: new Date(NOW - id * 1_000).toISOString(),
    updated_at: new Date(NOW - id * 1_000).toISOString(),
    ...options,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    transaction: automaticTransaction,
    headSha: HEAD_SHA,
    validationRuns: [],
    publicationRuns: [],
    nowMs: NOW,
    pull: { updated_at: new Date(NOW).toISOString() },
    ...overrides,
  };
}

test("validates an automatic transaction with no current-head run", () => {
  expect(planProjectValidationReconciliation(input())).toMatchObject({
    action: "validate",
    attempts: 0,
  });
});

test("waits for an active current-head validation", () => {
  expect(
    planProjectValidationReconciliation(
      input({ validationRuns: [run(1, null)] }),
    ),
  ).toMatchObject({ action: "wait", state: "validating", attempts: 0 });
});

test("retries fewer than three failed exact-head validations", () => {
  expect(
    planProjectValidationReconciliation({
      transaction: automaticTransaction,
      headSha: HEAD_SHA,
      validationRuns: [run(1, "failure"), run(2, "failure")],
      publicationRuns: [],
      nowMs: NOW,
    }),
  ).toMatchObject({ action: "retry-validation", attempts: 2 });
});

test("blocks after three failed exact-head validations", () => {
  expect(
    planProjectValidationReconciliation(
      input({
        validationRuns: [
          run(1, "failure"),
          run(2, "cancelled"),
          run(3, "timed_out"),
        ],
      }),
    ),
  ).toMatchObject({
    action: "block",
    state: "validation-blocked",
    attempts: 3,
  });
});

test("waits for the normal Publisher handoff grace", () => {
  expect(
    planProjectValidationReconciliation(
      input({ validationRuns: [run(1, "success")] }),
    ),
  ).toMatchObject({ action: "wait", state: "handoff", attempts: 1 });
});

test("publishes a successful validation after handoff grace", () => {
  expect(
    planProjectValidationReconciliation(
      input({
        validationRuns: [
          run(1, "success", {
            updated_at: new Date(
              NOW - PROJECT_VALIDATION_HANDOFF_GRACE_MS - 1,
            ).toISOString(),
          }),
        ],
      }),
    ),
  ).toMatchObject({ action: "publish", attempts: 1 });
});

test("waits for an active Publisher run", () => {
  expect(
    planProjectValidationReconciliation(
      input({
        validationRuns: [run(1, "success")],
        publicationRuns: [run(2, null)],
      }),
    ),
  ).toMatchObject({ action: "wait", state: "publishing", attempts: 0 });
});

test("retries a failed Publisher below three attempts", () => {
  expect(
    planProjectValidationReconciliation(
      input({
        validationRuns: [run(1, "success")],
        publicationRuns: [run(2, "failure"), run(3, "failure")],
      }),
    ),
  ).toMatchObject({ action: "retry-publication", attempts: 2 });
});

test("blocks an exhausted Publisher", () => {
  expect(
    planProjectValidationReconciliation(
      input({
        validationRuns: [run(1, "success")],
        publicationRuns: [
          run(2, "failure"),
          run(3, "cancelled"),
          run(4, "timed_out"),
        ],
      }),
    ),
  ).toMatchObject({
    action: "block",
    state: "publication-blocked",
    attempts: 3,
  });
});

test("regenerates an unchanged automatic PR after a successful Publisher grace", () => {
  expect(
    planProjectValidationReconciliation(
      input({
        validationRuns: [run(1, "success")],
        publicationRuns: [
          run(2, "success", {
            updated_at: new Date(
              NOW - PROJECT_VALIDATION_REGENERATION_GRACE_MS - 1,
            ).toISOString(),
          }),
        ],
      }),
    ),
  ).toMatchObject({ action: "regenerate", attempts: 1 });
});

test("ignores manual transactions and old-head attempts", () => {
  const manual = { ...automaticTransaction, publication_mode: "manual" };
  expect(
    planProjectValidationReconciliation(input({ transaction: manual })),
  ).toEqual({ action: "ignore" });
  expect(
    planProjectValidationReconciliation(
      input({
        validationRuns: [run(1, "failure", { head_sha: OLD_HEAD_SHA })],
      }),
    ),
  ).toMatchObject({ action: "validate", attempts: 0 });
});

test("renders one machine-readable state marker", () => {
  expect(
    projectValidationStateComment({
      state: "retrying-validation",
      headSha: HEAD_SHA,
      attempts: 2,
      run: run(12, "failure"),
    }),
  ).toContain(
    `${JSON.stringify({ schema_version: 1, status: "retrying-validation", head_sha: HEAD_SHA, attempts: 2, run_id: 12 })}`,
  );
  expect(PROJECT_VALIDATION_RETRY_LIMIT).toBe(3);
});
