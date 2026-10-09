import { expect, test } from "vitest";
import { reconcileAutomation } from "../../scripts/automation/reconcile.mjs";
import {
  AUTOMATION_NOW,
  operationFixture,
} from "../helpers/automation-fixtures";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
test("later reconciliation preserves completed time and creates no terminal receipt heartbeat", async () => {
  const operation = operationFixture({ stage: "finalized" });
  const completedAt = new Date(AUTOMATION_NOW - 60000).toISOString();
  const receipt: AutomationReceipt = {
    schema_version: 1,
    operation,
    updatedAt: completedAt,
    completedAt,
  };
  const writes: AutomationReceipt[] = [];
  const input = {
    nowMs: AUTOMATION_NOW,
    inventory: async () => [operation],
    receipts: [receipt],
    persist: async (value: AutomationReceipt) => {
      writes.push(value);
    },
    dispatch: async () => {
      throw new Error("Completed work cannot dispatch");
    },
  };
  await reconcileAutomation(input);
  input.nowMs += 86400000;
  await reconcileAutomation(input);
  expect(writes).toEqual([]);
});
