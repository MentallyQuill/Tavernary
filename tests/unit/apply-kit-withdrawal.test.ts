import { expect, test } from "vitest";

import { applyKitWithdrawal } from "../../scripts/kits/apply-withdrawal.mjs";

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
