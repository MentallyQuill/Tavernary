import { afterEach, expect, test, vi } from "vitest";
import { loadGithubAutomationInventory } from "../../scripts/automation/github-inventory.mjs";
import { AUTOMATION_NOW } from "../helpers/automation-fixtures";

afterEach(() => vi.useRealTimers());

test("a changing active-run inventory recovers after GitHub's list view settles", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(AUTOMATION_NOW);
  const started = Date.now();
  const active = { id: 703, status: "queued" };
  let activeReads = 0;
  const gh = async (args: string[]) => {
    const path = args.find((value) => value.startsWith("repos/"))!;
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
    if (args.includes("status=queued")) {
      activeReads++;
      return JSON.stringify([
        {
          total_count: 1,
          workflow_runs: Date.now() - started < 5000 ? [] : [active],
        },
      ]);
    }
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  const pending = loadGithubAutomationInventory({
    gh,
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 317929880,
    nowMs: AUTOMATION_NOW,
    receipts: [],
  }).then(
    (state) => ({ runs: state.runs, error: null }),
    (error: unknown) => ({ runs: [], error }),
  );
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(result.error).toBeNull();
  expect(result.runs).toEqual([active]);
  expect(Date.now() - started).toBeGreaterThanOrEqual(5000);
  expect(activeReads).toBeLessThanOrEqual(3);
});

test("an inventory page survives transient GitHub server failures without restarting selection", async () => {
  vi.useFakeTimers();
  const repository = "MentallyQuill/Tavernary";
  let issueReads = 0;
  const gh = async (args: string[]) => {
    const path = args.find((value) => value.startsWith("repos/"))!;
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    if (path.endsWith("/issues") || path.endsWith("/pulls")) {
      if (
        path.endsWith("/issues") &&
        args.includes("state=open") &&
        ++issueReads < 3
      )
        throw new Error("gh api failed: HTTP 502: Server Error");
      return "[[]]";
    }
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  const pending = loadGithubAutomationInventory({
    gh,
    repository,
    publisherActorId: 317929880,
    nowMs: AUTOMATION_NOW,
    receipts: [],
  }).then(
    () => null,
    (error: unknown) => error,
  );
  await vi.runAllTimersAsync();
  expect(await pending).toBeNull();
  expect(issueReads).toBe(3);
});
