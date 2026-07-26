import { describe, expect, test } from "vitest";

import { validateKitData } from "../../scripts/kits/validation.mjs";

const project = (
  id: string,
  kind: "frontend" | "extension" | "preset",
  visibility = "published",
) => ({ id, kind, visibility });

const projectRecords = [
  project("frontend", "frontend"),
  project("frontend-b", "frontend"),
  project("memory", "extension"),
  project("preset", "preset"),
  project("flagged", "extension", "quarantined"),
];

const kitRecord = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  id: "story-kit-41",
  status: "published",
  title: "Story Kit",
  description: "A compact story stack.",
  author: { github_user_id: 123, login: "author" },
  source_issue_number: 41,
  project_ids: ["frontend", "memory", "preset"],
  published_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
  ...overrides,
});

const supportSnapshot = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1,
  kit_id: "story-kit-41",
  source_issue_number: 41,
  refreshed_at: "2026-07-24T01:00:00.000Z",
  stale_since: null,
  supporters: [
    {
      github_user_id: 456,
      login: "supporter",
      first_reacted_at: "2026-07-24T00:30:00.000Z",
      active: true,
    },
  ],
  ...overrides,
});

describe("Kit registry validation", () => {
  test("accepts published records, duplicate titles, and retained flagged rows", async () => {
    const errors = await validateKitData({
      projectRecords,
      kitRecords: [
        kitRecord(),
        kitRecord({
          id: "story-kit-42",
          source_issue_number: 42,
          project_ids: ["frontend", "memory", "flagged"],
        }),
      ],
      supportSnapshots: [supportSnapshot()],
      blockedUsers: { schema_version: 1, blocked: [] },
    });

    expect(errors).toEqual([]);
  });

  test("rejects missing projects and exact set duplicates", async () => {
    const errors = await validateKitData({
      projectRecords,
      kitRecords: [
        kitRecord({ id: "first" }),
        kitRecord({
          id: "second",
          source_issue_number: 42,
          project_ids: ["preset", "frontend", "memory"],
        }),
        kitRecord({
          id: "missing",
          source_issue_number: 43,
          project_ids: ["frontend", "memory", "gone"],
        }),
      ],
      supportSnapshots: [],
      blockedUsers: { schema_version: 1, blocked: [] },
    });

    expect(errors).toContain("second: duplicates the project set of first");
    expect(errors).toContain("missing: unknown project gone");
  });

  test("rejects a canonical Kit with multiple Frontends", async () => {
    const errors = await validateKitData({
      projectRecords,
      kitRecords: [
        kitRecord({
          project_ids: ["frontend", "frontend-b", "memory"],
        }),
      ],
      supportSnapshots: [],
      blockedUsers: { schema_version: 1, blocked: [] },
    });

    expect(errors).toContain(
      "story-kit-41: requires exactly one Frontend project",
    );
  });

  test("rejects a canonical Kit whose Frontend is not first", async () => {
    const errors = await validateKitData({
      projectRecords,
      kitRecords: [
        kitRecord({
          project_ids: ["memory", "frontend", "preset"],
        }),
      ],
      supportSnapshots: [],
      blockedUsers: { schema_version: 1, blocked: [] },
    });

    expect(errors).toContain("story-kit-41: Frontend project must be first");
  });

  test("rejects malformed authority, text, timestamps, status, and tombstones", async () => {
    const errors = await validateKitData({
      projectRecords,
      kitRecords: [
        kitRecord({
          id: "broken",
          title: "No",
          description: Array.from({ length: 101 }, () => "word").join(" "),
          author: { github_user_id: "123", login: "" },
          source_issue_number: 0,
          status: "withdrawn",
          published_at: "not-a-date",
          updated_at: "also-not-a-date",
        }),
      ],
      supportSnapshots: [],
      blockedUsers: { schema_version: 1, blocked: [] },
    });

    expect(errors.some((error) => error.startsWith("broken: schema"))).toBe(
      true,
    );
    expect(errors).toContain("broken: description must contain 1–100 words");
    expect(errors).toContain("broken: withdrawn record requires withdrawn_at");
  });

  test("rejects invalid support snapshots and duplicate blocked identities", async () => {
    const errors = await validateKitData({
      projectRecords,
      kitRecords: [kitRecord()],
      supportSnapshots: [
        supportSnapshot({
          source_issue_number: 99,
          supporters: [
            {
              github_user_id: 456,
              login: "supporter",
              first_reacted_at: "invalid",
              active: true,
            },
          ],
        }),
      ],
      blockedUsers: {
        schema_version: 1,
        blocked: [
          { github_user_id: 456, login: "one", reason: "abuse" },
          { github_user_id: 456, login: "two", reason: "abuse" },
        ],
      },
    });

    expect(errors).toContain(
      "story-kit-41: support source issue does not match canonical record",
    );
    expect(
      errors.some((error) => error.startsWith("story-kit-41: support schema")),
    ).toBe(true);
    expect(errors).toContain("blocked user 456: duplicate GitHub user id");
  });
});
