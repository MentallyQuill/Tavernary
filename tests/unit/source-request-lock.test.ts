import { expect, test } from "vitest";

import { planSourceRequestAdmission } from "../../scripts/help/source-request-lock.mjs";
import { PROJECT_PUBLICATION_TRANSACTION_MARKER } from "../../scripts/publication/project-publication-transaction.mjs";

function addCardsManifest(issueNumber: number, sourceId = "github-42") {
  return {
    number: issueNumber,
    state: "open",
    labels: ["issue-admitted", "project-owner-request"],
    body: [
      "### Owner request manifest",
      "",
      "```json",
      JSON.stringify({
        schema_version: 2,
        request_kind: "project-owner",
        operation: "add-cards",
        source_id: sourceId,
        repository_id: 42,
        tag_vocabulary_hash: "f".repeat(64),
        source_fingerprint: "a".repeat(64),
        proposed_cards: [{ draft_id: "draft-1" }],
        explanation: null,
      }),
      "```",
    ].join("\n"),
  };
}

function cardEditIssue(issueNumber: number, sourceId = "github-42") {
  const issue = addCardsManifest(issueNumber, sourceId);
  return {
    ...issue,
    body: issue.body.replace('"add-cards"', '"edit-card"'),
  };
}

function addCardsPull(issueNumber: number, sourceId = "github-42") {
  const transaction = {
    schema_version: 2,
    operation: "add-cards",
    producer: "project-owner-request",
    publication_mode: "manual",
    issue_number: issueNumber,
    project_ids: ["owner-alpha-extra"],
    source_id: sourceId,
    source_identity: {
      type: "github",
      canonical: "github:42",
      repository_id: 42,
    },
    actor: { id: 7, login: "Owner", type: "User" },
    authority_type: "repository-owner",
    input_digest: "b".repeat(64),
    input_fingerprints: { projects: {}, source: "c".repeat(64) },
    base_sha: "d".repeat(40),
    generated_head_sha: "e".repeat(40),
    generated_paths: ["data/registry/projects/owner-alpha-extra.json"],
    policy_version: "2026-07-29",
    copy_result: null,
  };
  return {
    number: 91,
    state: "open",
    merged_at: null,
    body: [
      PROJECT_PUBLICATION_TRANSACTION_MARKER,
      JSON.stringify(transaction),
      "-->",
    ].join("\n"),
  };
}

test("rejects a second unresolved add-card issue for one immutable source", () => {
  expect(
    planSourceRequestAdmission({
      sourceId: "github-42",
      issueNumber: 12,
      issues: [addCardsManifest(11)],
      pulls: [],
    }),
  ).toEqual({
    action: "reject",
    reasonCode: "source-request-already-open",
    conflictingIssueNumber: 11,
  });
});

test("uses source IDs rather than mutable repository slugs", () => {
  expect(
    planSourceRequestAdmission({
      sourceId: "github-42",
      issueNumber: 12,
      issues: [addCardsManifest(11, "github-42")],
      pulls: [],
    }),
  ).toMatchObject({ action: "reject" });
  expect(
    planSourceRequestAdmission({
      sourceId: "github-84",
      issueNumber: 12,
      issues: [addCardsManifest(11, "github-42")],
      pulls: [],
    }),
  ).toEqual({ action: "admit" });
});

test("closed issues, merged pulls, and ordinary card edits do not occupy the lock", () => {
  expect(
    planSourceRequestAdmission({
      sourceId: "github-42",
      issueNumber: 12,
      issues: [{ ...addCardsManifest(9), state: "closed" }, cardEditIssue(10)],
      pulls: [{ ...addCardsPull(8), state: "closed", merged_at: "2026-07-29" }],
    }),
  ).toEqual({ action: "admit" });
});

test("open add-card pull requests retain the lock", () => {
  expect(
    planSourceRequestAdmission({
      sourceId: "github-42",
      issueNumber: 12,
      issues: [],
      pulls: [addCardsPull(11)],
    }),
  ).toEqual({
    action: "reject",
    reasonCode: "source-request-already-open",
    conflictingIssueNumber: 11,
  });
});

test("simultaneous candidates deterministically admit the lower issue number", () => {
  expect(
    planSourceRequestAdmission({
      sourceId: "github-42",
      issueNumber: 11,
      issues: [addCardsManifest(12)],
      pulls: [],
    }),
  ).toEqual({ action: "admit" });
  expect(
    planSourceRequestAdmission({
      sourceId: "github-42",
      issueNumber: 12,
      issues: [addCardsManifest(11)],
      pulls: [],
    }),
  ).toMatchObject({ action: "reject", conflictingIssueNumber: 11 });
});

test("fails malformed unvalidated references open", () => {
  expect(
    planSourceRequestAdmission({
      sourceId: "github-42",
      issueNumber: 12,
      issues: [{ number: 11, state: "open", body: "add-cards github-42" }],
      pulls: [{ number: 90, state: "open", body: "add-cards github-42" }],
    }),
  ).toEqual({ action: "admit" });
});
