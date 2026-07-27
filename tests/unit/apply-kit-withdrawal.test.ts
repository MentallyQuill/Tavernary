import { expect, test } from "vitest";

import {
  applyKitWithdrawal,
  fetchWithdrawalIssue,
} from "../../scripts/kits/apply-withdrawal.mjs";

const kit = {
  schema_version: 1 as const,
  id: "story-kit-241",
  status: "published" as const,
  title: "Story Kit",
  description: "A complete stack.",
  author: { github_user_id: 42, login: "author" },
  source_issue_number: 241,
  project_ids: ["frontend", "memory", "lore"],
  published_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-02T00:00:00.000Z",
};

test("rejects withdrawal by a different durable GitHub identity", () => {
  expect(() =>
    applyKitWithdrawal({
      kit,
      actorId: 7,
      now: "2026-07-24T18:00:00.000Z",
    }),
  ).toThrow("Only the Kit author may withdraw this Kit.");
  expect(kit.status).toBe("published");
});

test("creates a tombstone while preserving all history-bearing fields", () => {
  expect(
    applyKitWithdrawal({
      kit,
      actorId: 42,
      now: "2026-07-24T18:00:00.000Z",
    }),
  ).toEqual({
    ...kit,
    status: "withdrawn",
    withdrawn_at: "2026-07-24T18:00:00.000Z",
  });
});

test("preserves the original tombstone on a withdrawal retry", () => {
  const withdrawn = {
    ...kit,
    status: "withdrawn" as const,
    withdrawn_at: "2026-07-24T18:00:00.000Z",
  };

  expect(
    applyKitWithdrawal({
      kit: withdrawn,
      actorId: 42,
      now: "2026-07-25T18:00:00.000Z",
    }),
  ).toEqual(withdrawn);
});

test("fetches an open labeled withdrawal issue for dispatched processing", async () => {
  const issue = {
    number: 88,
    state: "open",
    title: "A readable withdrawal title",
    body: "### Kit ID\n\nstory-kit-241",
    labels: [{ name: "kit-withdrawal" }],
    user: { id: 42, login: "author" },
  };
  const requestedPaths: string[] = [];

  await expect(
    fetchWithdrawalIssue({
      repository: "MentallyQuill/Tavernary",
      issueNumber: 88,
      request: async (path: string) => {
        requestedPaths.push(path);
        return issue;
      },
    }),
  ).resolves.toEqual(issue);
  expect(requestedPaths).toEqual(["/repos/MentallyQuill/Tavernary/issues/88"]);
});

test("rejects a dispatched issue without the withdrawal label", async () => {
  await expect(
    fetchWithdrawalIssue({
      repository: "MentallyQuill/Tavernary",
      issueNumber: 88,
      request: async () => ({
        number: 88,
        state: "open",
        labels: [{ name: "project-submission" }],
        user: { id: 42, login: "author" },
      }),
    }),
  ).rejects.toThrow("Issue is not an open Kit withdrawal request.");
});

test.each([
  { user: { id: "42", login: "author" } },
  { user: { id: 0, login: "author" } },
  { user: undefined },
])("rejects a withdrawal issue without a numeric author", async ({ user }) => {
  await expect(
    fetchWithdrawalIssue({
      repository: "MentallyQuill/Tavernary",
      issueNumber: 88,
      request: async () => ({
        number: 88,
        state: "open",
        labels: [{ name: "kit-withdrawal" }],
        user,
      }),
    }),
  ).rejects.toThrow("Kit withdrawal issue has no valid numeric author.");
});
