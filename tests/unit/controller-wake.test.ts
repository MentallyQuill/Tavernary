import { expect, test } from "vitest";
import * as controller from "../../scripts/automation/controller-wake.mjs";

test("pending reconciliation coalesces worker wakes while preserving distinct canonical writes", async () => {
  const calls: string[][] = [];
  const result = await controller.wakeAutomationWriter({
    repository: "MentallyQuill/Tavernary",
    gh: async (args: string[]) => {
      calls.push(args);
      return JSON.stringify({
        total_count: 2,
        workflow_runs: [
          { status: "queued", display_title: "Automation write publish abc" },
          { status: "queued", display_title: "Automation reconcile" },
        ],
      });
    },
  });
  expect(result).toEqual({ status: "coalesced" });
  expect(calls.some((args) => args[0] === "workflow")).toBe(false);
});

test("a running pass permits one future reconciliation alongside distinct writes", async () => {
  const calls: string[][] = [];
  const result = await controller.wakeAutomationWriter({
    repository: "MentallyQuill/Tavernary",
    gh: async (args: string[]) => {
      calls.push(args);
      return args[0] === "api"
        ? JSON.stringify({
            total_count: 1,
            workflow_runs: [
              { status: "queued", display_title: "Automation write retain 17" },
            ],
          })
        : "";
    },
  });
  expect(result.status).toBe("dispatched");
  expect(calls.at(-1)).toEqual([
    "workflow",
    "run",
    "automation-writer.yml",
    "--repo",
    "MentallyQuill/Tavernary",
    "--ref",
    "main",
    "-f",
    "mode=reconcile",
  ]);
  expect(
    calls
      .filter((args) => args[0] === "api")
      .some((args) => args.includes("status=in_progress")),
  ).toBe(false);
});
test("an incomplete pending-run page cannot authorize another dispatch", async () => {
  let dispatched = false;
  await expect(
    controller.wakeAutomationWriter({
      repository: "MentallyQuill/Tavernary",
      gh: async (args: string[]) => {
        if (args[0] === "workflow") dispatched = true;
        return JSON.stringify({ total_count: 101, workflow_runs: [] });
      },
    }),
  ).rejects.toThrow("incomplete");
  expect(dispatched).toBe(false);
});
