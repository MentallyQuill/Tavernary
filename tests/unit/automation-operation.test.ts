import { expect, test } from "vitest";
import {
  operationKey,
  selectDueOperations,
} from "../../scripts/automation/operation.mjs";
import { validateAutomationReceipt } from "../../scripts/automation/receipts.mjs";
import {
  operationFixture,
  receiptFixture,
  AUTOMATION_NOW,
} from "../helpers/automation-fixtures";

test("input edits change identity while event replays do not", () => {
  const identity = {
    kind: "project" as const,
    subject: "issue:42",
    inputDigest: "a".repeat(64),
    policyVersion: "1",
  };
  expect(operationKey(identity)).toBe(operationKey({ ...identity }));
  expect(operationKey({ ...identity, inputDigest: "b".repeat(64) })).not.toBe(
    operationKey(identity),
  );
});

test("valid receipts round-trip while unknown versions and extra fields fail closed", () => {
  const valid = receiptFixture();
  expect(validateAutomationReceipt(JSON.parse(JSON.stringify(valid)))).toEqual(
    valid,
  );
  for (const invalid of [
    { ...valid, schema_version: 2 },
    { ...valid, rawContent: "secret" },
    {
      ...valid,
      operation: { ...valid.operation, key: "../registry/project.json" },
    },
    { ...valid, operation: { ...valid.operation, stage: "unchecked-success" } },
  ])
    expect(() => validateAutomationReceipt(invalid)).toThrow("receipt");
});

test("receipts reject mismatched keys, unsafe handles, clocks and diagnostics", () => {
  const valid = receiptFixture();
  const invalidOperations = [
    { ...valid.operation, key: "c".repeat(64) },
    { ...valid.operation, expectedSha: "main" },
    { ...valid.operation, workerRunId: -1 },
    { ...valid.operation, nextEligibleAt: "2026-02-30T12:00:00.000Z" },
    {
      ...valid.operation,
      retry: {
        failure: { kind: "unknown", reasonCode: "raw secret" },
        transientAttempts: 0,
        immediateAttempts: 0,
      },
    },
  ];
  for (const operation of invalidOperations)
    expect(() => validateAutomationReceipt({ ...valid, operation })).toThrow(
      "receipt",
    );
  expect(() =>
    validateAutomationReceipt({
      ...valid,
      updatedAt: new Date(AUTOMATION_NOW - 7_200_000).toISOString(),
    }),
  ).toThrow("receipt");
  expect(() =>
    validateAutomationReceipt({
      ...valid,
      operation: { ...valid.operation, stage: "finalized" },
    }),
  ).toThrow("receipt");
});

test("receipt completion and failure evidence must be internally consistent", () => {
  const receipt = receiptFixture();
  expect(
    validateAutomationReceipt(
      receiptFixture({
        operation: operationFixture({ stage: "finalized" }),
        completedAt: receipt.updatedAt,
      }),
    ),
  ).toMatchObject({ completedAt: receipt.updatedAt });
  expect(() =>
    validateAutomationReceipt(
      receiptFixture({
        operation: operationFixture({ stage: "finalized", workerRunId: 123 }),
        completedAt: receipt.updatedAt,
      }),
    ),
  ).toThrow("receipt");
  expect(() =>
    validateAutomationReceipt(
      receiptFixture({
        operation: operationFixture({
          retry: {
            failure: { kind: "permanent", reasonCode: "workflow-cancelled" },
            transientAttempts: 0,
            immediateAttempts: 0,
          },
        }),
      }),
    ),
  ).toThrow("receipt");
});

test("selects twenty oldest due operations stably with one slot per subject", () => {
  const operations = Array.from({ length: 120 }, (_, index) =>
    operationFixture({
      identity: {
        kind: "project",
        subject: `issue:${index + 1}`,
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
      createdAt: new Date(AUTOMATION_NOW - (120 - index) * 1_000).toISOString(),
    }),
  );
  const repeatedSource = operationFixture({
    identity: { ...operations[0].identity, kind: "advisory" },
    createdAt: operations[0].createdAt,
  });
  const selected = selectDueOperations(
    [...operations, repeatedSource].reverse(),
    { nowMs: AUTOMATION_NOW },
  );
  expect(selected).toHaveLength(20);
  expect(
    new Set(selected.map((operation) => operation.identity.subject)).size,
  ).toBe(20);
  expect(selected.map((operation) => operation.identity.subject)).toEqual(
    operations.slice(0, 20).map((operation) => operation.identity.subject),
  );
  expect(
    selectDueOperations([repeatedSource, ...operations], {
      nowMs: AUTOMATION_NOW,
    }),
  ).toEqual(selected);
});

test("active, future, permanent and completed work cannot consume due slots", () => {
  const due = operationFixture();
  const future = operationFixture({
    identity: { ...due.identity, subject: "issue:43" },
    nextEligibleAt: new Date(AUTOMATION_NOW + 1).toISOString(),
  });
  const active = operationFixture({
    identity: { ...due.identity, subject: "issue:44" },
    workerRunId: 123,
  });
  const done = operationFixture({
    identity: { ...due.identity, subject: "issue:45" },
    stage: "finalized",
  });
  const permanent = operationFixture({
    identity: { ...due.identity, subject: "issue:46" },
    retry: {
      failure: { kind: "permanent", reasonCode: "validation-failed" },
      transientAttempts: 0,
      immediateAttempts: 0,
    },
  });
  expect(
    selectDueOperations([future, active, done, permanent, due], {
      nowMs: AUTOMATION_NOW,
    }),
  ).toEqual([due]);
  expect(
    selectDueOperations([due], { nowMs: AUTOMATION_NOW, limit: 0 }),
  ).toEqual([]);
  expect(() => selectDueOperations([due], { nowMs: Number.NaN })).toThrow(
    "clock",
  );
});

test("stale duplicate events cannot reopen active, permanent or completed operations", () => {
  const stale = operationFixture();
  for (const current of [
    operationFixture({ workerRunId: 123 }),
    operationFixture({ stage: "finalized" }),
    operationFixture({
      retry: {
        failure: { kind: "permanent", reasonCode: "authorization-lost" },
        transientAttempts: 0,
        immediateAttempts: 0,
      },
    }),
  ]) {
    expect(
      selectDueOperations([stale, current], { nowMs: AUTOMATION_NOW }),
    ).toEqual([]);
  }
});

test("identity serialization ignores property order but includes kind, subject and policy", () => {
  const identity = {
    kind: "project" as const,
    subject: "issue:42",
    inputDigest: "a".repeat(64),
    policyVersion: "1",
  };
  expect(
    operationKey({
      policyVersion: "1",
      inputDigest: "a".repeat(64),
      subject: "issue:42",
      kind: "project",
    }),
  ).toBe(operationKey(identity));
  for (const changed of [
    { ...identity, kind: "kit" as const },
    { ...identity, subject: "issue:43" },
    { ...identity, policyVersion: "2" },
  ])
    expect(operationKey(changed)).not.toBe(operationKey(identity));
});

test("rejects unsupported and path-derived identities instead of hashing ambiguous input", () => {
  const identity = {
    kind: "project" as const,
    subject: "issue:42",
    inputDigest: "a".repeat(64),
    policyVersion: "1",
  };
  for (const changed of [
    { ...identity, subject: "../data/project.json" },
    { ...identity, inputDigest: "short" },
    { ...identity, policyVersion: "" },
    { ...identity, rawContent: "secret" },
  ])
    expect(() => operationKey(changed)).toThrow("identity");
});
