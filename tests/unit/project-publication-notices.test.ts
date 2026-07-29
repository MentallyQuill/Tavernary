import { expect, test } from "vitest";

import {
  planCopyAdjustmentNotice,
  planOwnerDelistNotice,
} from "../../scripts/publication/project-publication-notices.mjs";
import { createProjectPublicationTransaction } from "../../scripts/publication/project-publication-transaction.mjs";

function transaction(overrides: Record<string, unknown> = {}) {
  return createProjectPublicationTransaction({
    operation: "edit-card",
    producer: "project-owner-request",
    publication_mode: "automatic",
    issue_number: 128,
    project_ids: ["owner-alpha"],
    source_id: "github-42",
    source_identity: {
      type: "github",
      canonical: "github:42",
      repository_id: 42,
    },
    actor: { id: 11, login: "Owner", type: "User" },
    authority_type: "repository-owner",
    input_digest: "a".repeat(64),
    input_fingerprints: {
      projects: { "owner-alpha": "d".repeat(64) },
      source: null,
    },
    base_sha: "b".repeat(40),
    generated_head_sha: "c".repeat(40),
    generated_paths: ["data/registry/projects/owner-alpha.json"],
    policy_version: "2026-07-29",
    copy_result: {
      mode: "preserve",
      result: "accepted-with-light-edits",
      change_reasons: ["punctuation-corrected"],
      policy_signal: "none",
    },
    ...overrides,
  });
}

test("plans one neutral owner copy-adjustment notice", () => {
  const plan = planCopyAdjustmentNotice(transaction(), []);

  expect(plan).toMatchObject({ action: "create" });
  if (plan.action !== "create") throw new Error("Expected create notice.");
  expect(plan.body).toContain("<!-- tavernary-project-copy-notice:128 -->");
  expect(plan.body).toContain("limited automated catalog-copy adjustment");
  expect(plan.body).toContain("did not delay publication");
  expect(plan.body).not.toContain("punctuation-corrected");
  expect(plan.body).not.toContain("submitted_summary");
});

test("deduplicates and updates only bot-owned copy notices", () => {
  const first = planCopyAdjustmentNotice(transaction(), []);
  if (first.action !== "create") throw new Error("Expected create notice.");
  expect(
    planCopyAdjustmentNotice(transaction(), [
      { id: 7, body: first.body, user: { type: "Bot" } },
    ]),
  ).toEqual({ action: "noop" });
  expect(
    planCopyAdjustmentNotice(transaction(), [
      {
        id: 7,
        body: "<!-- tavernary-project-copy-notice:128 -->\nold",
        user: { type: "Bot" },
      },
      { id: 8, body: first.body, user: { type: "User" } },
    ]),
  ).toMatchObject({ action: "update", commentId: 7 });
});

test("does not notify community synthesis or unchanged copy", () => {
  expect(
    planCopyAdjustmentNotice(
      transaction({
        operation: "create",
        producer: "project-submission",
        publication_mode: "automatic",
        authority_type: "community-submitter",
        input_fingerprints: { projects: {}, source: null },
        generated_paths: [
          "data/registry/projects/owner-alpha.json",
          "data/registry/sources/github-42.json",
          "data/snapshots/github/github-42.json",
        ],
        copy_result: {
          mode: "synthesize",
          result: "accepted-with-light-edits",
          change_reasons: ["whitespace-normalized"],
          policy_signal: "none",
        },
      }),
      [],
    ),
  ).toEqual({ action: "none" });
  expect(
    planCopyAdjustmentNotice(
      transaction({
        copy_result: {
          mode: "preserve",
          result: "accepted-unchanged",
          change_reasons: [],
          policy_signal: "none",
        },
      }),
      [],
    ),
  ).toEqual({ action: "none" });
});

test("renders an idempotent verified-owner delisting maintenance issue", () => {
  const delist = transaction({
    operation: "delist-source",
    project_ids: ["owner-alpha", "owner-beta"],
    input_fingerprints: {
      projects: {},
      source: "d".repeat(64),
    },
    generated_paths: ["data/registry/sources/github-42.json"],
    copy_result: null,
  });
  const plan = planOwnerDelistNotice({
    transaction: delist,
    source: {
      id: "github-42",
      type: "github",
      repository: "Owner/Alpha",
      repository_id: 42,
      status: "delisted",
      status_reason: "removed",
      refresh_policy: "paused",
    },
    projects: [
      { id: "owner-alpha", name: "Alpha [Tool]", source_id: "github-42" },
      { id: "owner-beta", name: "Beta <script>", source_id: "github-42" },
    ],
    kits: [
      {
        id: "alpha-kit",
        title: "Alpha Kit",
        status: "published",
        project_ids: ["owner-beta"],
      },
    ],
    pull: { number: 129, html_url: "https://github.test/pull/129" },
    issue: {
      number: 128,
      html_url: "https://github.test/issues/128",
      ownerNote: "@staff [click](https://bad.test) <script>alert(1)</script>",
    },
    publishedAt: "2026-07-29T12:00:00.000Z",
    existingIssues: [],
  });

  expect(plan).toMatchObject({
    action: "create",
    title: "[Owner source delisting notice] Owner/Alpha",
    labels: ["owner-delist-notice"],
  });
  if (plan.action !== "create") {
    throw new Error("Expected owner delist notice.");
  }
  expect(plan.body).toContain(
    "A verified repository owner permanently delisted this repository source.",
  );
  expect(plan.body).toContain("No staff approval is required.");
  expect(plan.body).toContain("Review is optional");
  expect(plan.body).toContain("Owner/Alpha");
  expect(plan.body).toContain("Owner");
  expect(plan.body).toContain("GitHub ID `11`");
  expect(plan.body).toContain("Alpha Kit");
  expect(plan.body).toContain("Alpha \\[Tool\\]");
  expect(plan.body).toContain("Beta");
  expect(plan.body).toContain("status: delisted");
  expect(plan.body).toContain("permanently blocked");
  expect(plan.body).toContain(
    "<!-- tavernary-owner-delist-notice:github-42:128 -->",
  );
  expect(plan.body).not.toContain("@staff");
  expect(plan.body).not.toContain("<script>");
  expect(plan.body).not.toContain("](https://bad.test)");
});

test("does not create an owner notice for trusted-staff delisting", () => {
  expect(
    planOwnerDelistNotice({
      transaction: transaction({
        operation: "delist-source",
        project_ids: ["owner-alpha"],
        input_fingerprints: {
          projects: {},
          source: "d".repeat(64),
        },
        generated_paths: ["data/registry/sources/github-42.json"],
        authority_type: "tavernary-staff",
        copy_result: null,
      }),
      source: {},
      projects: [],
      kits: [],
      pull: {},
      issue: {},
      existingIssues: [],
    }),
  ).toEqual({ action: "none" });
});
