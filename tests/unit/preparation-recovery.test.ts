import { expect, test } from "vitest";
import { recoverInventoryWorker } from "../../scripts/automation/inventory-worker.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
import {
  preparedResultContextFixture,
  AUTOMATION_NOW,
} from "../helpers/automation-fixtures";
function fixture() {
  const context = preparedResultContextFixture();
  const time = new Date(AUTOMATION_NOW).toISOString();
  const dispatch = {
    ...context.run,
    id: 600,
    created_at: time,
    updated_at: time,
    path: ".github/workflows/automation-worker.yml",
    display_title: `Automation ${context.operation.key}`,
  };
  const producer = {
    ...context.run,
    display_title: `Automation prepare ${context.operation.key}`,
    created_at: time,
    updated_at: new Date(AUTOMATION_NOW + 60_000).toISOString(),
  };
  const receipt: AutomationReceipt = {
    schema_version: 1 as const,
    operation: {
      ...context.operation,
      workerRunId: 600,
      nextEligibleAt: new Date(AUTOMATION_NOW + 15 * 60_000).toISOString(),
    },
    updatedAt: time,
    completedAt: null,
  };
  return {
    context,
    dispatch,
    producer,
    receipt,
    input: {
      receipts: [receipt],
      runs: [dispatch, producer],
      repository: context.currentState.repository,
      nowMs: AUTOMATION_NOW + 20 * 60_000,
      publisherActorId: context.publisherActorId,
    },
  };
}
test("an authenticated completed preparation releases dispatch waiting without claiming publication", () => {
  const input = fixture();
  recoverInventoryWorker(input.context.operation, input.input, [
    input.dispatch,
  ]);
  expect(input.context.operation.retry).toBeNull();
  expect(input.context.operation.workerRunId).toBeNull();
  expect(input.context.operation.nextEligibleAt).toBeNull();
  expect(input.context.operation.stage).toBe("admitted");
});
test("a saved artifact failure keeps its delay after the same completed preparation", () => {
  const input = fixture();
  const until = new Date(input.input.nowMs + 86_400_000).toISOString();
  input.input.receipts[0] = {
    ...input.receipt,
    updatedAt: new Date(input.input.nowMs).toISOString(),
    operation: {
      ...input.receipt.operation,
      workerRunId: null,
      nextEligibleAt: until,
      retry: {
        failure: {
          kind: "configuration" as const,
          reasonCode: "authentication-unavailable" as const,
        },
        transientAttempts: 0,
        immediateAttempts: 0,
      },
    },
  };
  recoverInventoryWorker(input.context.operation, input.input, [
    input.dispatch,
  ]);
  expect(input.context.operation.nextEligibleAt).toBe(until);
  expect(input.context.operation.retry?.failure.kind).toBe("configuration");
});
test("a foreign preparation cannot release a stalled dispatch", () => {
  const input = fixture();
  input.producer.actor.id++;
  recoverInventoryWorker(input.context.operation, input.input, [
    input.dispatch,
  ]);
  expect(input.context.operation.retry?.failure.kind).toBe("unknown");
});

test("a newer preparation can release a superseded artifact while the failed artifact stays ineligible", () => {
  const input = fixture();
  const failedAt = input.input.nowMs;
  input.input.receipts[0] = {
    ...input.receipt,
    updatedAt: new Date(failedAt).toISOString(),
    operation: {
      ...input.receipt.operation,
      workerRunId: null,
      nextEligibleAt: null,
      retry: {
        failure: { kind: "superseded", reasonCode: "input-superseded" },
        transientAttempts: 0,
        immediateAttempts: 0,
      },
    },
  };
  recoverInventoryWorker(input.context.operation, input.input, [
    input.dispatch,
  ]);
  expect(input.context.operation.retry?.failure.kind).toBe("superseded");
  input.input.runs[1] = {
    ...input.producer,
    id: 701,
    updated_at: new Date(failedAt + 60_000).toISOString(),
  };
  recoverInventoryWorker(input.context.operation, input.input, [
    input.dispatch,
  ]);
  expect(input.context.operation.retry).toBeNull();
});
