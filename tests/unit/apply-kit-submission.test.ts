import { expect, test } from "vitest";

import { applyKitSubmission } from "../../scripts/kits/apply-submission.mjs";

const now = "2026-07-24T18:00:00.000Z";
const issue = { number: 241, user: { id: 12345678, login: "example-author" } };
const create = {
  operation: "create" as const,
  kit_id: null,
  title: "Long-Form Storyteller",
  description: "A complete storytelling stack.",
  project_ids: ["frontend", "memory", "lore"],
};
const existing = {
  schema_version: 1 as const,
  id: "original-200",
  status: "published" as const,
  title: "Original",
  description: "Original description.",
  author: { github_user_id: 12345678, login: "old-login" },
  source_issue_number: 200,
  project_ids: ["frontend", "memory", "lore"],
  published_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  tavernary_pick: true,
};

test("creates a complete stable Kit record from the issue actor", () => {
  expect(applyKitSubmission({ manifest: create, issue, now })).toEqual({
    schema_version: 1,
    id: "long-form-storyteller-241",
    status: "published",
    title: create.title,
    description: create.description,
    author: { github_user_id: issue.user.id, login: issue.user.login },
    source_issue_number: 241,
    project_ids: create.project_ids,
    published_at: now,
    updated_at: now,
    tavernary_pick: false,
  });
});

test("edits only author-controlled fields and preserves canonical identity", () => {
  const result = applyKitSubmission({
    manifest: {
      ...create,
      operation: "edit",
      kit_id: existing.id,
      title: "Revised",
      project_ids: ["frontend", "memory", "writer"],
    },
    issue,
    existingKit: existing,
    now,
  });
  expect(result).toEqual({
    ...existing,
    title: "Revised",
    description: create.description,
    project_ids: ["frontend", "memory", "writer"],
    author: { ...existing.author, login: issue.user.login },
    updated_at: now,
  });
  expect(existing).toMatchObject({
    title: "Original",
    project_ids: ["frontend", "memory", "lore"],
  });
});

test("rejects edits by a different numeric actor and exact duplicate creates", () => {
  expect(() =>
    applyKitSubmission({
      manifest: { ...create, operation: "edit", kit_id: existing.id },
      issue: { ...issue, user: { id: 7, login: "other" } },
      existingKit: existing,
      now,
    }),
  ).toThrow("Only the Kit author may publish an edit.");
  expect(() =>
    applyKitSubmission({
      manifest: create,
      issue,
      existingKit: existing,
      now,
    }),
  ).toThrow("An exact duplicate Kit already exists.");
});
