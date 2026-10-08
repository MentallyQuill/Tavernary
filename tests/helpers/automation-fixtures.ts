import {
  operationKey,
  type AutomationOperation,
} from "../../scripts/automation/operation.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";

export const AUTOMATION_NOW = Date.parse("2026-10-07T12:00:00.000Z");

export function operationFixture(
  overrides: Partial<AutomationOperation> = {},
): AutomationOperation {
  const identity = overrides.identity ?? {
    kind: "project",
    subject: "issue:42",
    inputDigest: "a".repeat(64),
    policyVersion: "1",
  };
  return {
    key: operationKey(identity),
    identity,
    stage: "admitted",
    createdAt: new Date(AUTOMATION_NOW - 3_600_000).toISOString(),
    nextEligibleAt: null,
    expectedSha: "b".repeat(40),
    workerRunId: null,
    retry: null,
    ...overrides,
  };
}

export function receiptFixture(
  overrides: Partial<AutomationReceipt> = {},
): AutomationReceipt {
  return {
    schema_version: 1,
    operation: operationFixture(),
    updatedAt: new Date(AUTOMATION_NOW).toISOString(),
    completedAt: null,
    ...overrides,
  };
}
