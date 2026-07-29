import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  applyKitSubmission,
  findExistingKitForSubmission,
  writeAppliedKitOutput,
} from "../../scripts/kits/apply-submission.mjs";

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
};

test("emits the canonical Kit ID for workflow consumers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tavernary-kit-output-"));
  const output = join(directory, "output.txt");

  await writeAppliedKitOutput(output, existing);

  expect(await readFile(output, "utf8")).toBe("kit_id=original-200\n");
});

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
  });
});

test("treats an identical create retry as a no-op", () => {
  const published = {
    schema_version: 1 as const,
    id: "long-form-storyteller-241",
    status: "published" as const,
    title: create.title,
    description: create.description,
    author: { github_user_id: issue.user.id, login: issue.user.login },
    source_issue_number: issue.number,
    project_ids: create.project_ids,
    published_at: "2026-07-24T17:00:00.000Z",
    updated_at: "2026-07-24T17:00:00.000Z",
  };

  expect(
    applyKitSubmission({
      manifest: create,
      issue,
      existingKit: published,
      now,
    }),
  ).toEqual(published);
});

test("finds a create retry by its immutable source issue", () => {
  expect(
    findExistingKitForSubmission({
      manifest: create,
      issueNumber: 241,
      kits: [
        existing,
        {
          ...existing,
          id: "long-form-storyteller-241",
          source_issue_number: 241,
        },
      ],
    }),
  ).toMatchObject({
    id: "long-form-storyteller-241",
    source_issue_number: 241,
  });
});

test("rejects a create retry after the canonical Kit was withdrawn", () => {
  const withdrawn = {
    schema_version: 1 as const,
    id: "long-form-storyteller-241",
    status: "withdrawn" as const,
    title: create.title,
    description: create.description,
    author: { github_user_id: issue.user.id, login: issue.user.login },
    source_issue_number: issue.number,
    project_ids: create.project_ids,
    published_at: "2026-07-24T17:00:00.000Z",
    updated_at: "2026-07-24T17:00:00.000Z",
    withdrawn_at: "2026-07-24T17:30:00.000Z",
  };

  expect(() =>
    applyKitSubmission({
      manifest: create,
      issue,
      existingKit: withdrawn,
      now,
    }),
  ).toThrow("A withdrawn Kit cannot be republished as a create retry.");
});

test("rejects edits to a withdrawn canonical Kit at apply time", () => {
  expect(() =>
    applyKitSubmission({
      manifest: {
        ...create,
        operation: "edit",
        kit_id: existing.id,
      },
      issue,
      existingKit: {
        ...existing,
        status: "withdrawn",
        withdrawn_at: "2026-07-24T17:30:00.000Z",
      },
      now,
    }),
  ).toThrow("A withdrawn Kit cannot be edited.");
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

test("lets trusted staff edit content without changing Kit provenance", () => {
  const staffIssue = {
    number: 999,
    user: { id: 2625904, login: "MentallyQuill" },
  };
  const result = applyKitSubmission({
    manifest: {
      ...create,
      operation: "edit",
      kit_id: existing.id,
      title: "Staff-corrected title",
      project_ids: ["frontend", "memory", "writer"],
    },
    issue: staffIssue,
    existingKit: existing,
    editAuthority: "tavernary-staff",
    now,
  });

  expect(result).toEqual({
    ...existing,
    title: "Staff-corrected title",
    description: create.description,
    project_ids: ["frontend", "memory", "writer"],
    updated_at: now,
  });
  expect(result).toMatchObject({
    id: existing.id,
    author: existing.author,
    source_issue_number: existing.source_issue_number,
    published_at: existing.published_at,
  });
  expect(result.author).not.toBe(existing.author);
});

test("treats an unchanged edit retry as a timestamp-preserving no-op", () => {
  const result = applyKitSubmission({
    manifest: {
      operation: "edit",
      kit_id: existing.id,
      title: existing.title,
      description: existing.description,
      project_ids: existing.project_ids,
    },
    issue: {
      ...issue,
      user: { ...issue.user, login: existing.author.login },
    },
    existingKit: existing,
    now,
  });

  expect(result).toBe(existing);
  expect(result.updated_at).toBe("2026-07-01T00:00:00.000Z");
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
