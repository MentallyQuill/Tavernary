import { expect, test, vi } from "vitest";
import { acquirePreparedKitData } from "../../scripts/automation/kit-preparation.mjs";
import { discoverKitOperations } from "../../scripts/automation/kit-operations.mjs";
import { kitInventoryFixture } from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
function fixture(withdrawal = false) {
  const input = kitInventoryFixture({
    operation: withdrawal ? "withdrawal" : "create",
  });
  const operations = discoverKitOperations(input);
  const state = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: input.publisherActorId,
    nowMs: input.nowMs,
    operations,
    receipts: [],
    remote: {
      issues: input.issues,
      pulls: [],
      runs: [],
      mainHeadSha: "b".repeat(40),
    },
    local: {
      revision: "b".repeat(40),
      kits: input.kits,
      projects: input.projects,
      sources: Object.values(input.sourcesById),
      snapshots: Object.values(input.snapshotsBySourceId),
      blockedUsers: {
        blocked: [
          { github_user_id: 6, login: "Blocked", reason: "Test block" },
        ],
      },
      kitSnapshots: [],
      trustedEditors: { schema_version: 1, editors: [] },
    },
  } as unknown as AutomationInventoryState;
  return { state, operation: operations[0] };
}
test("Kit preparation reads reactions from the canonical source issue and excludes bots and blocked supporters", async () => {
  const input = fixture();
  const reaction = (id: number, type = "User") => ({
    content: "+1",
    user: { id, login: `User${id}`, type },
    created_at: "2026-10-07T12:00:00Z",
  });
  const gh = vi.fn(async () =>
    JSON.stringify([reaction(5), reaction(6), reaction(7, "Bot")]),
  );
  const files = await acquirePreparedKitData({ ...input, gh });
  const kit = JSON.parse(files["data/registry/kits/example-kit-42.json"]);
  const support = JSON.parse(
    files["data/snapshots/github/kits/example-kit-42.json"],
  );
  expect(kit.author.github_user_id).toBe(1);
  expect(
    support.supporters.map(
      (user: { github_user_id: number }) => user.github_user_id,
    ),
  ).toEqual([5]);
  expect(gh).toHaveBeenCalledWith([
    "api",
    "repos/MentallyQuill/Tavernary/issues/42/reactions?per_page=100&page=1",
  ]);
});
test("withdrawal preparation retains the support ledger as inactive without fetching or deleting votes", async () => {
  const input = fixture(true);
  input.state.local.kitSnapshots = [
    {
      schema_version: 1,
      kit_id: "example-kit-42",
      source_issue_number: 42,
      refreshed_at: "2026-10-07T12:00:00Z",
      stale_since: null,
      supporters: [
        {
          github_user_id: 5,
          login: "User5",
          first_reacted_at: "2026-10-07T11:00:00Z",
          active: true,
        },
      ],
    },
  ];
  const gh = vi.fn(async () => {
    throw new Error("Withdrawal must not acquire new votes.");
  });
  const files = await acquirePreparedKitData({ ...input, gh });
  expect(
    JSON.parse(files["data/registry/kits/example-kit-42.json"]).status,
  ).toBe("withdrawn");
  expect(
    JSON.parse(files["data/snapshots/github/kits/example-kit-42.json"])
      .supporters,
  ).toEqual([
    {
      github_user_id: 5,
      login: "User5",
      first_reacted_at: "2026-10-07T11:00:00Z",
      active: false,
    },
  ]);
  expect(gh).not.toHaveBeenCalled();
});
test("a provider outage stops initial Kit support preparation with a safe retry classification", async () => {
  const input = fixture();
  const gh = vi.fn(async () => {
    throw Object.assign(new Error("GitHub unavailable."), { status: 429 });
  });
  await expect(acquirePreparedKitData({ ...input, gh })).rejects.toMatchObject({
    status: 429,
  });
});
