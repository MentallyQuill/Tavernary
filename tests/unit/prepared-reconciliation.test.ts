import { expect, test, vi } from "vitest";
import { reconcilePreparedOperations } from "../../scripts/automation/prepared-reconciliation.mjs";
import {
  preparedResultContextFixture,
  operationFixture,
} from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
function fixture() {
  const context = preparedResultContextFixture();
  const state = {
    repository: context.currentState.repository,
    publisherActorId: context.publisherActorId,
    operations: [context.operation],
    remote: {
      runs: [
        {
          ...context.run,
          display_title: `Automation prepare ${context.operation.key}`,
        },
      ],
    },
  } as unknown as AutomationInventoryState;
  return {
    state,
    hasResult: vi.fn(async () => true),
    publish: vi.fn(
      async (_wakes: { operationKey: string; runId: number }[]) => ({
        published: 1,
        recovered: 0,
        waiting: 0,
        regenerated: 0,
        rejected: 0,
      }),
    ),
  };
}
test("scheduled reconciliation recovers a missed completion notification through the same publisher", async () => {
  const input = fixture();
  const result = await reconcilePreparedOperations(input);
  expect(result.consumedKeys).toEqual([input.state.operations[0].key]);
  expect(result.published).toBe(1);
  expect(input.publish).toHaveBeenCalledTimes(1);
  expect(input.publish).toHaveBeenCalledWith([
    { operationKey: input.state.operations[0].key, runId: 700 },
  ]);
});

test("scheduled recovery submits compatible handoffs as one bounded publication batch", async () => {
  const input = fixture();
  const second = operationFixture({
    identity: {
      ...input.state.operations[0].identity,
      subject: "source:github-43",
    },
  });
  input.state.operations.push(second);
  input.state.remote.runs.push({
    ...input.state.remote.runs[0],
    id: 701,
    display_title: `Automation prepare ${second.key}`,
  });
  await reconcilePreparedOperations(input);
  expect(input.publish).toHaveBeenCalledTimes(1);
  expect(input.publish.mock.calls[0][0]).toHaveLength(2);
});
test("a completed preparation with no artifact cannot count as publication or block ordinary due work", async () => {
  const input = fixture();
  input.hasResult.mockResolvedValue(false);
  const result = await reconcilePreparedOperations(input);
  expect(result.consumedKeys).toEqual([]);
  expect(input.publish).not.toHaveBeenCalled();
});
test("a failed handoff consumes its bounded attempt while preserving other reconciliation work", async () => {
  const input = fixture();
  input.publish.mockRejectedValue(new Error("Artifact unavailable."));
  const result = await reconcilePreparedOperations(input);
  expect(result.failures).toBe(1);
  expect(result.consumedKeys).toEqual([input.state.operations[0].key]);
});
test("a zero quota performs no artifact reads or publication", async () => {
  const input = fixture();
  expect(
    (await reconcilePreparedOperations({ ...input, limit: 0 })).consumedKeys,
  ).toEqual([]);
  expect(input.hasResult).not.toHaveBeenCalled();
});
