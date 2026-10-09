import { expect, test, vi } from "vitest";
import { synchronizeWithdrawalFeedback } from "../../scripts/automation/withdrawal-feedback.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";

function fixture() {
  const issue = {
    number: 42,
    state: "open",
    body: "### Kit withdrawal manifest\n\ninvalid JSON",
    labels: [{ name: "kit-withdrawal" }],
    user: { id: 7, login: "author", type: "User" },
  };
  const state = {
    repository: "MentallyQuill/Tavernary",
    local: { revision: "a".repeat(40), kits: [] },
    remote: { mainHeadSha: "a".repeat(40), issues: [issue] },
  } as unknown as AutomationInventoryState;
  const writes: string[][] = [];
  const gh = vi.fn(async (args: string[]) => {
    if (
      args.includes("PATCH") ||
      args.includes("POST") ||
      args.includes("DELETE")
    ) {
      writes.push(args);
      return "{}";
    }
    if (args.some((value) => value.endsWith("/comments")))
      return JSON.stringify([
        [
          {
            id: 88,
            body: "<!-- tavernary-kit-withdrawal-correction --> forged",
            user: { id: 7, login: "author", type: "User" },
          },
        ],
      ]);
    return JSON.stringify(issue);
  });
  return { state, issue, writes, gh, issueNumber: 42 };
}

test("malformed withdrawal feedback is paginated and cannot adopt a user-forged correction marker", async () => {
  const input = fixture();
  await synchronizeWithdrawalFeedback(input);
  expect(
    input.gh.mock.calls.some(
      ([args]) =>
        args.includes("--paginate") &&
        args.some((v) => v.endsWith("/comments")),
    ),
  ).toBe(true);
  expect(
    input.writes.some(
      (args) =>
        args.some((v) => v.endsWith("/issues/42/comments")) &&
        args.includes("POST"),
    ),
  ).toBe(true);
  expect(JSON.stringify(input.writes)).not.toContain("comments/88");
  expect(JSON.stringify(input.writes)).toContain("needs-information");
});

test("a late withdrawal edit stops all correction mutations", async () => {
  const input = fixture();
  input.gh.mockImplementation(async (args) => {
    if (args.some((v) => v.endsWith("/issues/42")))
      return JSON.stringify({ ...input.issue, body: "changed" });
    throw new Error("No other API call is authorized");
  });
  await expect(synchronizeWithdrawalFeedback(input)).rejects.toThrow(/changed/);
  expect(input.writes).toEqual([]);
});

test("a stale canonical checkout cannot decide withdrawal feedback", async () => {
  const input = fixture();
  input.state.remote.mainHeadSha = "b".repeat(40);
  await expect(synchronizeWithdrawalFeedback(input)).rejects.toThrow(/current/);
  expect(input.gh).not.toHaveBeenCalled();
});
