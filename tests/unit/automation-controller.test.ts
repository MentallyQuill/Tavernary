import { expect, test } from "vitest";
import { reconcileAutomation } from "../../scripts/automation/reconcile.mjs";
import {
  AUTOMATION_NOW,
  controllerFixture,
  operationFixture,
} from "../helpers/automation-fixtures";

test("a missed webhook is recovered by the scheduled pass", async () => {
  const effects = controllerFixture({ missedWebhook: true });
  const result = await reconcileAutomation(effects.input);
  expect(result.dispatched).toBe(1);
  expect(result.permanentFailures).toBe(0);
  expect(effects.dispatches).toHaveLength(1);
  expect(effects.receipts.at(-1)?.operation.workerRunId).toBe(700);
});

test("a pass selects at most twenty oldest subjects with no duplicate dispatch", async () => {
  const effects = controllerFixture();
  const operations = Array.from({ length: 30 }, (_, index) =>
    operationFixture({
      identity: {
        kind: "project",
        subject: `issue:${index + 1}`,
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
      createdAt: new Date(AUTOMATION_NOW - (30 - index) * 60_000).toISOString(),
    }),
  );
  effects.input.inventory = async () => [...operations, operations[0]];
  const result = await reconcileAutomation(effects.input);
  expect(result.dispatched).toBe(20);
  expect(
    effects.dispatches.map((operation) => operation.identity.subject),
  ).toEqual(
    operations.slice(0, 20).map((operation) => operation.identity.subject),
  );
});

test("dry-run performs no dispatch or persistence", async () => {
  const effects = controllerFixture();
  effects.input.dryRun = true;
  const result = await reconcileAutomation(effects.input);
  expect(result.selectedKeys).toHaveLength(1);
  expect(effects.dispatches).toHaveLength(0);
  expect(effects.receipts).toHaveLength(0);
});

test("active, future, finalized and permanently rejected work is counted without dispatch", async () => {
  const effects = controllerFixture();
  const base = operationFixture();
  effects.input.inventory = async () => [
    { ...base, workerRunId: 700 },
    {
      ...base,
      nextEligibleAt: new Date(AUTOMATION_NOW + 86_400_000).toISOString(),
    },
    { ...base, stage: "finalized" },
    {
      ...base,
      retry: {
        failure: { kind: "permanent", reasonCode: "authorization-lost" },
        transientAttempts: 0,
        immediateAttempts: 0,
      },
    },
  ];
  const result = await reconcileAutomation(effects.input);
  expect(result).toMatchObject({
    dispatched: 0,
    waiting: 2,
    finished: 1,
    permanentFailures: 1,
  });
  expect(effects.dispatches).toHaveLength(0);
});

test("future retry and active-worker observations are persisted once without heartbeat writes", async () => {
  const effects = controllerFixture();
  const operation = operationFixture({
    nextEligibleAt: new Date(AUTOMATION_NOW + 300_000).toISOString(),
    retry: {
      failure: { kind: "transient", reasonCode: "workflow-cancelled" },
      transientAttempts: 0,
      immediateAttempts: 0,
    },
  });
  effects.input.inventory = async () => [operation];
  await reconcileAutomation(effects.input);
  expect(effects.receipts).toHaveLength(1);
  effects.input.receipts = effects.receipts;
  effects.input.nowMs += 60_000;
  await reconcileAutomation(effects.input);
  expect(effects.receipts).toHaveLength(1);
});

test("a failed intent write prevents dispatch", async () => {
  const effects = controllerFixture();
  effects.input.persist = async () => {
    throw new Error("Write unavailable");
  };
  await expect(reconcileAutomation(effects.input)).rejects.toThrow(
    "Write unavailable",
  );
  expect(effects.dispatches).toHaveLength(0);
});

test("a receipt failure after successful dispatch does not clear the live handle or issue another dispatch", async () => {
  const effects = controllerFixture();
  let writes = 0;
  effects.input.persist = async () => {
    writes++;
    if (writes === 2) throw new Error("Write unavailable");
  };
  await expect(reconcileAutomation(effects.input)).rejects.toThrow(
    "Write unavailable",
  );
  expect(writes).toBe(2);
  expect(effects.dispatches).toHaveLength(1);
});

test("a current-input change at the final boundary suppresses stale work", async () => {
  const effects = controllerFixture();
  effects.input.revalidate = async () => null;
  expect((await reconcileAutomation(effects.input)).dispatched).toBe(0);
  expect(effects.dispatches).toHaveLength(0);
});

test("configuration failures schedule daily incident probes and preserve sanitized diagnostics", async () => {
  const effects = controllerFixture();
  effects.input.dispatch = async () => {
    throw Object.assign(new Error("secret response"), {
      code: "provider-authentication-failed",
    });
  };
  const result = await reconcileAutomation(effects.input);
  expect(result).toMatchObject({
    dispatched: 0,
    incidents: 1,
    permanentFailures: 0,
  });
  expect(effects.receipts.at(-1)?.operation.nextEligibleAt).toBe(
    new Date(AUTOMATION_NOW + 86_400_000).toISOString(),
  );
  expect(JSON.stringify(effects.receipts)).not.toContain("secret response");
});

test("rate limits retain Retry-After without a self-wake loop", async () => {
  const effects = controllerFixture();
  effects.input.dispatch = async () => {
    throw { status: 429, retryAfterMs: 3_600_000 };
  };
  const result = await reconcileAutomation(effects.input);
  const operation = effects.receipts.at(-1)!.operation;
  expect(operation.retry?.failure.kind).toBe("transient");
  expect(Date.parse(operation.nextEligibleAt!)).toBeGreaterThanOrEqual(
    AUTOMATION_NOW + 3_600_000,
  );
  expect(result.permanentFailures).toBe(0);
  effects.input.inventory = async () => [operation];
  effects.input.receipts = effects.receipts;
  await reconcileAutomation(effects.input);
  expect(effects.receipts).toHaveLength(2);
});

test("GitHub CLI authorization failures open a configuration incident", async () => {
  const effects = controllerFixture();
  effects.input.dispatch = async () => {
    throw new Error("GitHub API failed (HTTP 403)");
  };
  const result = await reconcileAutomation(effects.input);
  expect(result.incidents).toBe(1);
  expect(effects.receipts.at(-1)!.operation.retry?.failure.kind).toBe(
    "configuration",
  );
});

test("an invalid dispatch effect cannot persist an unrelated operation", async () => {
  const effects = controllerFixture();
  effects.input.dispatch = async () => ({
    operation: operationFixture({
      identity: {
        kind: "project",
        subject: "issue:999",
        inputDigest: "e".repeat(64),
        policyVersion: "1",
      },
    }),
  });
  await reconcileAutomation(effects.input);
  expect(
    effects.receipts.some(
      (receipt) => receipt.operation.identity.subject === "issue:999",
    ),
  ).toBe(false);
});

test("observation writes share the twenty-operation quota and a zero limit produces no effects", async () => {
  const effects = controllerFixture();
  const operations = Array.from({ length: 30 }, (_, index) =>
    operationFixture({
      identity: {
        kind: "project",
        subject: `issue:${index + 1}`,
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
      workerRunId: 700 + index,
    }),
  );
  effects.input.inventory = async () => operations;
  effects.input.limit = 0;
  await reconcileAutomation(effects.input);
  expect(effects.receipts).toHaveLength(0);
  effects.input.limit = 20;
  await reconcileAutomation(effects.input);
  expect(effects.receipts).toHaveLength(20);
});
