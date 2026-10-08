import { expect, test, vi } from "vitest";
import { persistPreparedFailure } from "../../scripts/automation/prepared-failure.mjs";
import {
  AUTOMATION_NOW,
  operationFixture,
} from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
function fixture() {
  let operation = operationFixture();
  let nowMs = AUTOMATION_NOW;
  const persist = vi.fn(async (receipt: AutomationReceipt) => {
    operation = receipt.operation;
  });
  return {
    operationKey: operation.key,
    persist,
    load: async () =>
      ({ operations: [operation], nowMs }) as AutomationInventoryState,
    advance: () => {
      nowMs = Date.parse(operation.nextEligibleAt!);
    },
    replace: (value: typeof operation) => {
      operation = value;
    },
  };
}
test("an unavailable prepared artifact persists bounded retry state without leaking error text", async () => {
  const input = fixture();
  const outcome = await persistPreparedFailure({
    ...input,
    error: new Error("secret-token raw provider output"),
  });
  expect(outcome).toEqual({ persisted: true, incident: false });
  const receipt = input.persist.mock.calls[0][0];
  expect(receipt.operation.retry?.failure).toEqual({
    kind: "unknown",
    reasonCode: "unclassified-failure",
  });
  expect(
    Date.parse(receipt.operation.nextEligibleAt!) - AUTOMATION_NOW,
  ).toBeGreaterThanOrEqual(300_000);
  expect(JSON.stringify(receipt)).not.toContain("secret-token");
});
test("three repeated unknown handoff failures move to daily probes and a visible incident", async () => {
  const input = fixture();
  for (let i = 0; i < 2; i++) {
    await persistPreparedFailure({ ...input, error: new Error("Unavailable") });
    input.advance();
  }
  const before = (await input.load()).nowMs;
  expect(
    (
      await persistPreparedFailure({
        ...input,
        error: new Error("Unavailable"),
      })
    ).incident,
  ).toBe(true);
  expect(
    Date.parse(input.persist.mock.calls[2][0].operation.nextEligibleAt!) -
      before,
  ).toBe(86_400_000);
});
test("an invalid prepared result permanently stops its unchanged input", async () => {
  const input = fixture();
  await persistPreparedFailure({
    ...input,
    error: Object.assign(new Error("Unsafe bytes"), {
      code: "prepared-content-invalid",
    }),
  });
  expect(input.persist.mock.calls[0][0].operation.retry?.failure.kind).toBe(
    "permanent",
  );
});

test("replayed completion failures cannot append heartbeats or reset their saved delay", async () => {
  const input = fixture();
  await persistPreparedFailure({ ...input, error: new Error("Unavailable") });
  await persistPreparedFailure({ ...input, error: new Error("Unavailable") });
  expect(input.persist).toHaveBeenCalledTimes(1);
});

test("an authenticated provider diagnostic survives as configuration failure and a daily probe", async () => {
  const input = fixture();
  const result = await persistPreparedFailure({
    ...input,
    error: {
      failure: {
        kind: "configuration",
        reasonCode: "provider-authentication-failed",
      },
    },
  });
  expect(result.incident).toBe(true);
  expect(input.persist.mock.calls[0][0].operation.retry?.failure.kind).toBe(
    "configuration",
  );
  expect(
    Date.parse(input.persist.mock.calls[0][0].operation.nextEligibleAt!) -
      AUTOMATION_NOW,
  ).toBe(86_400_000);
});
test("a stale input or already published effect cannot acquire a failure receipt", async () => {
  const input = fixture();
  input.replace(
    operationFixture({
      identity: { ...operationFixture().identity, inputDigest: "c".repeat(64) },
    }),
  );
  expect(
    (
      await persistPreparedFailure({
        ...input,
        error: new Error("Unavailable"),
      })
    ).persisted,
  ).toBe(false);
  input.replace(
    operationFixture({ stage: "published", expectedSha: "d".repeat(40) }),
  );
  expect(
    (
      await persistPreparedFailure({
        ...input,
        error: new Error("Receipt unavailable"),
      })
    ).persisted,
  ).toBe(false);
  expect(input.persist).not.toHaveBeenCalled();
});
