import { expect, test } from "vitest";

import {
  createProjectPublicationTransaction,
  expectedTransactionPaths,
  parseProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../../scripts/publication/project-publication-transaction.mjs";

const sourceIdentity = {
  type: "github" as const,
  canonical: "github:42",
  repository_id: 42,
};

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    operation: "create" as const,
    producer: "project-submission" as const,
    issue_number: 72,
    project_id: "owner-project",
    source_identity: sourceIdentity,
    actor: { id: 11, login: "Submitter", type: "User" as const },
    authority_type: "community-submitter" as const,
    input_digest: "a".repeat(64),
    record_fingerprint: null,
    base_sha: "b".repeat(40),
    generated_head_sha: "c".repeat(40),
    generated_paths: [
      "data/snapshots/github/owner-project.json",
      "data/registry/projects/owner-project.json",
    ],
    policy_version: "2026-07-29",
    copy_result: {
      mode: "synthesize" as const,
      result: "accepted-with-light-edits" as const,
      change_reasons: ["whitespace-normalized"],
      policy_signal: "none" as const,
    },
    ...overrides,
  };
}

test("normalizes a create transaction with exact keys and path order", () => {
  const transaction = createProjectPublicationTransaction(createInput());

  expect(transaction).toEqual({
    schema_version: 1,
    operation: "create",
    producer: "project-submission",
    issue_number: 72,
    project_id: "owner-project",
    source_identity: sourceIdentity,
    actor: { id: 11, login: "Submitter", type: "User" },
    authority_type: "community-submitter",
    input_digest: "a".repeat(64),
    record_fingerprint: null,
    base_sha: "b".repeat(40),
    generated_head_sha: "c".repeat(40),
    generated_paths: [
      "data/registry/projects/owner-project.json",
      "data/snapshots/github/owner-project.json",
    ],
    policy_version: "2026-07-29",
    copy_result: {
      mode: "synthesize",
      result: "accepted-with-light-edits",
      change_reasons: ["whitespace-normalized"],
      policy_signal: "none",
    },
  });
  expect(expectedTransactionPaths(transaction)).toEqual(
    transaction.generated_paths,
  );
});

test.each([
  ["edit-card", ["data/registry/projects/owner-project.json"]],
  [
    "move-source",
    [
      "data/registry/projects/owner-project.json",
      "data/snapshots/github/owner-project.json",
    ],
  ],
  ["delist", ["data/registry/projects/owner-project.json"]],
] as const)("accepts owner %s transactions", (operation, generatedPaths) => {
  expect(
    createProjectPublicationTransaction(
      createInput({
        operation,
        producer: "project-owner-request",
        authority_type: "repository-owner",
        record_fingerprint: "d".repeat(64),
        generated_paths: [...generatedPaths].reverse(),
        copy_result: null,
      }),
    ).generated_paths,
  ).toEqual(generatedPaths);
});

test("allows a nullable source identity only for owner edit or delist", () => {
  for (const operation of ["edit-card", "delist"] as const) {
    expect(
      createProjectPublicationTransaction(
        createInput({
          operation,
          producer: "project-owner-request",
          authority_type: "tavernary-staff",
          source_identity: null,
          record_fingerprint: "d".repeat(64),
          generated_paths: ["data/registry/projects/owner-project.json"],
          copy_result: null,
        }),
      ).source_identity,
    ).toBeNull();
  }
  expect(() =>
    createProjectPublicationTransaction(createInput({ source_identity: null })),
  ).toThrow(/source identity/iu);
});

test.each([
  ["unknown key", { unexpected: true }],
  ["invalid actor", { actor: { id: 11, login: 7, type: "User" } }],
  ["invalid SHA", { base_sha: "not-a-sha" }],
  ["wrong producer", { producer: "project-owner-request" }],
  [
    "outside path",
    { generated_paths: ["scripts/publication/project-publication.mjs"] },
  ],
  [
    "missing registry",
    {
      generated_paths: ["data/snapshots/github/owner-project.json"],
    },
  ],
  [
    "duplicate path",
    {
      generated_paths: [
        "data/registry/projects/owner-project.json",
        "data/registry/projects/owner-project.json",
      ],
    },
  ],
  [
    "raw submitted summary",
    {
      copy_result: {
        mode: "synthesize",
        result: "accepted-unchanged",
        change_reasons: [],
        policy_signal: "none",
        submitted_summary: "raw",
      },
    },
  ],
] as const)("rejects %s tampering", (_label, override) => {
  expect(() =>
    createProjectPublicationTransaction(createInput(override)),
  ).toThrow();
});

test("parses only one valid shared transaction marker", () => {
  const transaction = createProjectPublicationTransaction(createInput());
  const body = [
    PROJECT_PUBLICATION_TRANSACTION_MARKER,
    JSON.stringify(transaction),
    "-->",
    "# Review",
  ].join("\n");

  expect(parseProjectPublicationTransaction(body)).toEqual(transaction);
  expect(parseProjectPublicationTransaction(`${body}\n${body}`)).toBeNull();
});
