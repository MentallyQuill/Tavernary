import { expect, test, vi } from "vitest";

import {
  applyKitWithdrawal,
  fetchWithdrawalIssue,
  parseKitWithdrawalIssue,
  processKitWithdrawal,
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

const manifest = {
  schema_version: 1,
  request_kind: "kit-withdrawal",
  kit_id: "story-kit-241",
  confirmation: true,
};

function withdrawalBody(value: unknown = manifest) {
  return [
    "### Kit ID",
    "",
    "readable-drift",
    "",
    "### Kit share URL",
    "",
    "https://example.invalid/wrong",
    "",
    "### Confirmation",
    "",
    "- [ ] I request withdrawal of a different Kit.",
    "",
    "### Kit withdrawal manifest",
    "",
    "```json",
    JSON.stringify(value),
    "```",
  ].join("\n");
}

function issue(overrides: Record<string, unknown> = {}) {
  return {
    number: 88,
    state: "open",
    body: withdrawalBody(),
    labels: [{ name: "kit-withdrawal" }],
    user: { id: 42, login: "author" },
    ...overrides,
  };
}

test("parses only the versioned Kit withdrawal manifest", () => {
  expect(parseKitWithdrawalIssue(withdrawalBody())).toEqual({
    valid: true,
    manifest,
  });
});

test.each([
  ["", "complete Kit withdrawal manifest"],
  [
    "### Kit withdrawal manifest\n\n{not json",
    "Kit withdrawal manifest is not valid JSON",
  ],
  [
    [
      "### Kit withdrawal manifest",
      "",
      JSON.stringify(manifest),
      "",
      "### Kit withdrawal manifest",
      "",
      JSON.stringify(manifest),
    ].join("\n"),
    "duplicate recognized form heading",
  ],
])("rejects missing, malformed, or duplicate manifests", (body, error) => {
  expect(parseKitWithdrawalIssue(body)).toMatchObject({
    valid: false,
    errors: [expect.stringContaining(error)],
  });
});

test("applies a valid author request while ignoring every readable mirror", async () => {
  const writes: unknown[] = [];
  const result = await processKitWithdrawal({
    issue: issue(),
    now: "2026-07-24T18:00:00.000Z",
    loadKit: async (kitId: string) => {
      expect(kitId).toBe("story-kit-241");
      return kit;
    },
    writeKit: async (kitId: string, value: unknown) => {
      writes.push({ kitId, value });
    },
  });

  expect(result).toEqual({
    status: "applied",
    kitId: "story-kit-241",
    changed: true,
  });
  expect(writes).toEqual([
    {
      kitId: "story-kit-241",
      value: {
        ...kit,
        status: "withdrawn",
        withdrawn_at: "2026-07-24T18:00:00.000Z",
      },
    },
  ]);
});

test.each([
  ["missing manifest", issue({ body: "" })],
  [
    "malformed manifest",
    issue({ body: withdrawalBody({ ...manifest, confirmation: false }) }),
  ],
  ["closed issue", issue({ state: "closed" })],
  ["missing label", issue({ labels: [] })],
  ["missing numeric author", issue({ user: { id: "42", login: "author" } })],
])("returns a controlled no-write result for %s", async (_name, inputIssue) => {
  const loadKit = vi.fn();
  const writeKit = vi.fn();

  await expect(
    processKitWithdrawal({
      issue: inputIssue,
      now: "2026-07-24T18:00:00.000Z",
      loadKit,
      writeKit,
    }),
  ).resolves.toMatchObject({
    status: "needs-information",
    errors: expect.any(Array),
    returnUrl: expect.stringMatching(
      /^https:\/\/tavernary\.org\/help\/withdraw-kit\/(?:\?kit=story-kit-241)?$/u,
    ),
  });
  expect(loadKit).not.toHaveBeenCalled();
  expect(writeKit).not.toHaveBeenCalled();
});

test("keeps a non-author request open without writing", async () => {
  const writeKit = vi.fn();
  await expect(
    processKitWithdrawal({
      issue: issue({ user: { id: 7, login: "other-user" } }),
      now: "2026-07-24T18:00:00.000Z",
      loadKit: async () => kit,
      writeKit,
    }),
  ).resolves.toEqual({
    status: "needs-information",
    errors: ["Only the Kit author may withdraw this Kit."],
    returnUrl: "https://tavernary.org/help/withdraw-kit/?kit=story-kit-241",
  });
  expect(writeKit).not.toHaveBeenCalled();
});

test("treats an existing author tombstone as an applied no-op", async () => {
  const writeKit = vi.fn();
  await expect(
    processKitWithdrawal({
      issue: issue(),
      now: "2026-07-25T18:00:00.000Z",
      loadKit: async () => ({
        ...kit,
        status: "withdrawn",
        withdrawn_at: "2026-07-24T18:00:00.000Z",
      }),
      writeKit,
    }),
  ).resolves.toEqual({
    status: "applied",
    kitId: "story-kit-241",
    changed: false,
  });
  expect(writeKit).not.toHaveBeenCalled();
});

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

test("fetches current issue state without interpreting readable or lifecycle fields", async () => {
  const fetched = {
    number: 88,
    state: "open",
    labels: [{ name: "project-submission" }],
    user: { id: "42", login: "author" },
  };
  await expect(
    fetchWithdrawalIssue({
      repository: "MentallyQuill/Tavernary",
      issueNumber: 88,
      request: async () => fetched,
    }),
  ).resolves.toBe(fetched);
});
