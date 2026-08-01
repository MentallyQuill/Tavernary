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
    schema_version: 2 as const,
    operation: "create" as const,
    producer: "project-submission" as const,
    publication_mode: "automatic" as const,
    issue_number: 72,
    project_ids: ["owner-project"],
    source_id: "github-42",
    source_identity: sourceIdentity,
    actor: { id: 11, login: "Submitter", type: "User" as const },
    authority_type: "community-submitter" as const,
    input_digest: "a".repeat(64),
    input_fingerprints: { projects: {}, source: null },
    base_sha: "b".repeat(40),
    generated_head_sha: "c".repeat(40),
    generated_paths: [
      "data/registry/projects/owner-project.json",
      "data/registry/sources/github-42.json",
      "data/snapshots/github/github-42.json",
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

test("accepts a source/card/snapshot create transaction with exact paths", () => {
  const transaction = createProjectPublicationTransaction(createInput());

  expect(transaction).toMatchObject({
    schema_version: 2,
    operation: "create",
    publication_mode: "automatic",
    project_ids: ["owner-project"],
    source_id: "github-42",
    input_fingerprints: { projects: {}, source: null },
  });
  expect(expectedTransactionPaths(transaction)).toEqual(
    transaction.generated_paths,
  );
});

test("accepts verified-owner manual create fallback without fabricated copy", () => {
  const transaction = createProjectPublicationTransaction(
    createInput({
      publication_mode: "manual",
      authority_type: "repository-owner",
      copy_result: null,
    }),
  );

  expect(transaction).toMatchObject({
    operation: "create",
    producer: "project-submission",
    publication_mode: "manual",
    authority_type: "repository-owner",
    copy_result: null,
  });
});

test("rejects manual create fallback from a community submitter", () => {
  expect(() =>
    createProjectPublicationTransaction(
      createInput({
        publication_mode: "manual",
        copy_result: null,
      }),
    ),
  ).toThrow("Invalid project publication transaction");
});

test("accepts one atomic manual add-card batch", () => {
  const transaction = createProjectPublicationTransaction(
    createInput({
      operation: "add-cards",
      producer: "project-owner-request",
      publication_mode: "manual",
      project_ids: ["card-a", "card-b"],
      authority_type: "repository-owner",
      input_fingerprints: {
        projects: {},
        source: "d".repeat(64),
      },
      generated_paths: [
        "data/registry/projects/card-a.json",
        "data/registry/projects/card-b.json",
      ],
      copy_result: null,
    }),
  );

  expect(expectedTransactionPaths(transaction)).toEqual(
    transaction.generated_paths,
  );
});

test("accepts synthesized copy for an owner-selected automatic summary", () => {
  const transaction = createProjectPublicationTransaction(
    createInput({
      operation: "edit-card",
      producer: "project-owner-request",
      project_ids: ["owner-project"],
      authority_type: "repository-owner",
      input_fingerprints: {
        projects: { "owner-project": "d".repeat(64) },
        source: null,
      },
      generated_paths: ["data/registry/projects/owner-project.json"],
    }),
  );

  expect(transaction.copy_result?.mode).toBe("synthesize");
});

test("accepts an immutable GitHub bot actor for a generated submission", () => {
  expect(
    createProjectPublicationTransaction(
      createInput({
        actor: {
          id: 41_898_282,
          login: "github-actions[bot]",
          type: "Bot",
        },
      }),
    ).actor,
  ).toEqual({
    id: 41_898_282,
    login: "github-actions[bot]",
    type: "Bot",
  });
});

test.each([
  ["edit-card", ["data/registry/projects/owner-project.json"], "card"],
  ["retire-card", ["data/registry/projects/owner-project.json"], "card"],
  ["restore-card", ["data/registry/projects/owner-project.json"], "card"],
  [
    "move-source",
    [
      "data/registry/sources/github-42.json",
      "data/snapshots/github/github-42.json",
    ],
    "source",
  ],
  ["delist-source", ["data/registry/sources/github-42.json"], "source"],
] as const)(
  "accepts owner %s transactions",
  (operation, generatedPaths, fingerprintKind) => {
    expect(
      createProjectPublicationTransaction(
        createInput({
          operation,
          producer: "project-owner-request",
          publication_mode: "automatic",
          authority_type: "repository-owner",
          input_fingerprints:
            fingerprintKind === "card"
              ? {
                  projects: { "owner-project": "d".repeat(64) },
                  source: null,
                }
              : { projects: {}, source: "d".repeat(64) },
          generated_paths: generatedPaths,
          copy_result: null,
        }),
      ).generated_paths,
    ).toEqual(generatedPaths);
  },
);

test("allows a nullable source identity only for trusted staff owner operations", () => {
  expect(
    createProjectPublicationTransaction(
      createInput({
        operation: "edit-card",
        producer: "project-owner-request",
        publication_mode: "automatic",
        authority_type: "tavernary-staff",
        source_identity: null,
        input_fingerprints: {
          projects: { "owner-project": "d".repeat(64) },
          source: null,
        },
        generated_paths: ["data/registry/projects/owner-project.json"],
        copy_result: null,
      }),
    ).source_identity,
  ).toBeNull();
  expect(() =>
    createProjectPublicationTransaction(createInput({ source_identity: null })),
  ).toThrow(/source identity/iu);
});

test.each([
  ["unknown key", { unexpected: true }],
  ["old schema", { schema_version: 1 }],
  ["invalid actor", { actor: { id: 11, login: 7, type: "User" } }],
  [
    "bot login presented as a user",
    {
      actor: {
        id: 41_898_282,
        login: "github-actions[bot]",
        type: "User",
      },
    },
  ],
  [
    "human login presented as a bot",
    { actor: { id: 11, login: "Submitter", type: "Bot" } },
  ],
  [
    "malformed bot suffix",
    { actor: { id: 11, login: "github-actions[bot", type: "Bot" } },
  ],
  [
    "unknown actor type",
    { actor: { id: 11, login: "Submitter", type: "Robot" } },
  ],
  ["invalid SHA", { base_sha: "not-a-sha" }],
  ["wrong producer", { producer: "project-owner-request" }],
  ["unsorted projects", { project_ids: ["z-card", "a-card"] }],
  [
    "automatic add cards",
    {
      operation: "add-cards",
      producer: "project-owner-request",
      project_ids: ["owner-project"],
      authority_type: "repository-owner",
      input_fingerprints: { projects: {}, source: "d".repeat(64) },
      generated_paths: ["data/registry/projects/owner-project.json"],
      copy_result: null,
    },
  ],
  [
    "outside path",
    { generated_paths: ["scripts/publication/project-publication.mjs"] },
  ],
  [
    "missing source registry",
    {
      generated_paths: [
        "data/registry/projects/owner-project.json",
        "data/snapshots/github/github-42.json",
      ],
    },
  ],
  [
    "duplicate path",
    {
      generated_paths: [
        "data/registry/projects/owner-project.json",
        "data/registry/sources/github-42.json",
        "data/registry/sources/github-42.json",
        "data/snapshots/github/github-42.json",
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
