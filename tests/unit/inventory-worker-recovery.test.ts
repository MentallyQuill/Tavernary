import { expect, test } from "vitest";
import { recoverInventoryWorker } from "../../scripts/automation/inventory-worker.mjs";
import { planAutomationWorker } from "../../scripts/automation/worker.mjs";
import type { WorkerDiagnosticRun } from "../../scripts/automation/worker-diagnostic.mjs";
import {
  AUTOMATION_NOW,
  operationFixture,
} from "../helpers/automation-fixtures";

const repository = "MentallyQuill/Tavernary";
const publisherActorId = 41_982_982;
function writerRun(
  key: string,
  overrides: Partial<WorkerDiagnosticRun> = {},
): WorkerDiagnosticRun {
  return {
    id: 701,
    path: ".github/workflows/automation-writer.yml",
    event: "workflow_dispatch",
    display_title: `Automation write prepare ${key}`,
    actor: { id: publisherActorId, type: "Bot" },
    head_branch: "main",
    repository: { id: 42, full_name: repository },
    head_repository: { id: 42, full_name: repository },
    head_sha: "c".repeat(40),
    status: "queued",
    conclusion: null,
    created_at: new Date(AUTOMATION_NOW - 30 * 60_000).toISOString(),
    updated_at: new Date(AUTOMATION_NOW - 30 * 60_000).toISOString(),
    ...overrides,
  };
}

test("a trusted queued writer beyond the wrapper lease prevents duplicate dispatch", () => {
  const operation = operationFixture();
  recoverInventoryWorker(
    operation,
    {
      receipts: [],
      nowMs: AUTOMATION_NOW,
      repository,
      publisherActorId,
      runs: [writerRun(operation.key)],
    },
    [],
  );
  expect(operation.workerRunId).toBe(701);
  expect(operation.stage).toBe("admitted");
  expect(planAutomationWorker(operation)).toEqual({ action: "wait" });
});
test.each([
  { actor: { id: 9, type: "Bot" } },
  { actor: { id: publisherActorId, type: "User" } },
  { head_repository: { full_name: "Foreign/Tavernary" } },
  { path: ".github/workflows/untrusted.yml" },
  { head_branch: "feature" },
  { event: "pull_request" },
  { display_title: `Automation write prepare ${"f".repeat(64)}` },
])(
  "an unrelated handoff supplies no live worker authority: %j",
  (overrides) => {
    const operation = operationFixture();
    recoverInventoryWorker(
      operation,
      {
        receipts: [],
        nowMs: AUTOMATION_NOW,
        repository,
        publisherActorId,
        runs: [writerRun(operation.key, overrides)],
      },
      [],
    );
    expect(operation.workerRunId).toBeNull();
    expect(planAutomationWorker(operation).action).toBe("dispatch");
  },
);

test.each(["failure", "success"])(
  "a completed %s writer releases the live handoff guard",
  (conclusion) => {
    const operation = operationFixture();
    recoverInventoryWorker(
      operation,
      {
        receipts: [],
        nowMs: AUTOMATION_NOW,
        repository,
        publisherActorId,
        runs: [writerRun(operation.key, { status: "completed", conclusion })],
      },
      [],
    );
    expect(operation.workerRunId).toBeNull();
    expect(operation.stage).toBe("admitted");
    expect(planAutomationWorker(operation).action).toBe("dispatch");
  },
);

test("a trusted running publish handoff remains active beyond 79 minutes", () => {
  const operation = operationFixture({
    createdAt: new Date(AUTOMATION_NOW - 3 * 3_600_000).toISOString(),
  });
  recoverInventoryWorker(
    operation,
    {
      receipts: [],
      nowMs: AUTOMATION_NOW,
      repository,
      publisherActorId,
      runs: [
        writerRun(operation.key, {
          status: "in_progress",
          display_title: `Automation write publish ${operation.key}`,
          created_at: new Date(AUTOMATION_NOW - 79 * 60_000).toISOString(),
        }),
      ],
    },
    [],
  );
  expect(planAutomationWorker(operation)).toEqual({ action: "wait" });
});

import { receiptFixture } from "../helpers/automation-fixtures";

test("an authenticated native worker diagnostic preserves the configuration probe schedule", () => {
  const operation = operationFixture();
  const run: WorkerDiagnosticRun = {
    ...writerRun(operation.key, {
      id: 702,
      path: ".github/workflows/automation-worker.yml",
      display_title: `Automation ${operation.key}`,
      status: "completed",
      conclusion: "failure",
    }),
    run_attempt: 1,
    automationDiagnostic: {
      schema_version: 1,
      operation_key: operation.key,
      runId: 702,
      runAttempt: 1,
      sourceSha: "c".repeat(40),
      failure: {
        kind: "configuration",
        reasonCode: "publisher-authentication-failed",
      },
    },
  };
  recoverInventoryWorker(
    operation,
    {
      receipts: [
        receiptFixture({
          operation: { ...operation, workerRunId: 702 },
          updatedAt: operation.createdAt,
        }),
      ],
      nowMs: AUTOMATION_NOW,
      repository,
      publisherActorId,
      runs: [run],
    },
    [run],
  );
  expect(operation.retry?.failure).toEqual({
    kind: "configuration",
    reasonCode: "publisher-authentication-failed",
  });
  expect(operation.retry?.immediateAttempts).toBe(0);
  expect(operation.nextEligibleAt).toBe(
    new Date(AUTOMATION_NOW - 30 * 60_000 + 86_400_000).toISOString(),
  );
});

test("a handoff without repository identity supplies no worker authority", () => {
  const operation = operationFixture();
  recoverInventoryWorker(
    operation,
    {
      receipts: [],
      nowMs: AUTOMATION_NOW,
      publisherActorId,
      runs: [writerRun(operation.key, { head_repository: undefined })],
    },
    [],
  );
  expect(operation.workerRunId).toBeNull();
});

test.each([
  { operation_key: "f".repeat(64) },
  { runId: 703 },
  { runAttempt: 2 },
  { sourceSha: "d".repeat(40) },
  {
    failure: {
      kind: "permanent",
      reasonCode: "publisher-authentication-failed",
    },
  },
])(
  "an unrelated diagnostic envelope does not change retry classification: %j",
  (overrides) => {
    const operation = operationFixture();
    const run: WorkerDiagnosticRun = {
      ...writerRun(operation.key, {
        id: 702,
        path: ".github/workflows/automation-worker.yml",
        display_title: `Automation ${operation.key}`,
        status: "completed",
        conclusion: "failure",
      }),
      run_attempt: 1,
      automationDiagnostic: {
        schema_version: 1,
        operation_key: operation.key,
        runId: 702,
        runAttempt: 1,
        sourceSha: "c".repeat(40),
        failure: {
          kind: "configuration",
          reasonCode: "publisher-authentication-failed",
        },
      },
    };
    Object.assign(run.automationDiagnostic!, overrides);
    recoverInventoryWorker(
      operation,
      {
        receipts: [
          receiptFixture({
            operation: { ...operation, workerRunId: 702 },
            updatedAt: operation.createdAt,
          }),
        ],
        nowMs: AUTOMATION_NOW,
        repository,
        publisherActorId,
        runs: [run],
      },
      [run],
    );
    expect(operation.retry?.failure).toEqual({
      kind: "unknown",
      reasonCode: "unclassified-failure",
    });
  },
);

test("writer handoffs require main even when the inventory has another branch preference", () => {
  const operation = operationFixture();
  recoverInventoryWorker(
    operation,
    {
      receipts: [],
      nowMs: AUTOMATION_NOW,
      publisherActorId,
      repository,
      defaultBranch: "feature",
      runs: [writerRun(operation.key, { head_branch: "feature" })],
    },
    [],
  );
  expect(operation.workerRunId).toBeNull();
});

test("a diagnostic with foreign numeric repository identity cannot upgrade a failure", () => {
  const operation = operationFixture();
  const run: WorkerDiagnosticRun = {
    ...writerRun(operation.key, {
      id: 702,
      path: ".github/workflows/automation-worker.yml",
      display_title: `Automation ${operation.key}`,
      status: "completed",
      conclusion: "failure",
      head_repository: { id: 99, full_name: repository },
    }),
    run_attempt: 1,
    automationDiagnostic: {
      schema_version: 1,
      operation_key: operation.key,
      runId: 702,
      runAttempt: 1,
      sourceSha: "c".repeat(40),
      failure: {
        kind: "configuration",
        reasonCode: "publisher-authentication-failed",
      },
    },
  };
  recoverInventoryWorker(
    operation,
    {
      receipts: [
        receiptFixture({
          operation: { ...operation, workerRunId: 702 },
          updatedAt: operation.createdAt,
        }),
      ],
      nowMs: AUTOMATION_NOW,
      repository,
      publisherActorId,
      runs: [run],
    },
    [run],
  );
  expect(operation.retry?.failure.kind).toBe("unknown");
});

test("an exact stored worker handle upgrades only its saved unknown failure from native evidence", () => {
  const operation = operationFixture();
  const run: WorkerDiagnosticRun = {
    ...writerRun(operation.key, {
      id: 702,
      path: ".github/workflows/automation-worker.yml",
      display_title: `Automation ${operation.key}`,
      status: "completed",
      conclusion: "failure",
    }),
    run_attempt: 1,
    automationDiagnostic: {
      schema_version: 1,
      operation_key: operation.key,
      runId: 702,
      runAttempt: 1,
      sourceSha: "c".repeat(40),
      failure: {
        kind: "configuration",
        reasonCode: "publisher-authentication-failed",
      },
    },
  };
  recoverInventoryWorker(
    operation,
    {
      receipts: [
        receiptFixture({
          operation: {
            ...operation,
            workerRunId: 702,
            retry: {
              failure: { kind: "unknown", reasonCode: "unclassified-failure" },
              transientAttempts: 2,
              immediateAttempts: 3,
            },
            nextEligibleAt: new Date(
              AUTOMATION_NOW + 15 * 60_000,
            ).toISOString(),
          },
        }),
      ],
      nowMs: AUTOMATION_NOW,
      repository,
      publisherActorId,
      runs: [run],
    },
    [run],
  );
  expect(operation.retry).toEqual({
    failure: {
      kind: "configuration",
      reasonCode: "publisher-authentication-failed",
    },
    transientAttempts: 2,
    immediateAttempts: 3,
  });
  expect(operation.nextEligibleAt).toBe(
    new Date(AUTOMATION_NOW - 30 * 60_000 + 86_400_000).toISOString(),
  );
});

test.each([
  {
    workerRunId: null,
    failure: { kind: "unknown" as const, reasonCode: "unclassified-failure" },
  },
  {
    workerRunId: 703,
    failure: { kind: "unknown" as const, reasonCode: "unclassified-failure" },
  },
  {
    workerRunId: 702,
    failure: {
      kind: "configuration" as const,
      reasonCode: "publisher-authentication-failed",
    },
  },
  {
    workerRunId: 702,
    failure: { kind: "permanent" as const, reasonCode: "authorization-lost" },
  },
])(
  "a newer unbound or classified retry preserves its existing authority: %j",
  ({ workerRunId, failure }) => {
    const operation = operationFixture();
    const run: WorkerDiagnosticRun = {
      ...writerRun(operation.key, {
        id: 702,
        path: ".github/workflows/automation-worker.yml",
        display_title: `Automation ${operation.key}`,
        status: "completed",
        conclusion: "failure",
      }),
      run_attempt: 1,
      automationDiagnostic: {
        schema_version: 1,
        operation_key: operation.key,
        runId: 702,
        runAttempt: 1,
        sourceSha: "c".repeat(40),
        failure: { kind: "transient", reasonCode: "provider-rate-limited" },
      },
    };
    const retry = { failure, transientAttempts: 2, immediateAttempts: 3 };
    const nextEligibleAt = new Date(AUTOMATION_NOW + 15 * 60_000).toISOString();
    recoverInventoryWorker(
      operation,
      {
        receipts: [
          receiptFixture({
            operation: { ...operation, workerRunId, retry, nextEligibleAt },
          }),
        ],
        nowMs: AUTOMATION_NOW,
        repository,
        publisherActorId,
        runs: [run],
      },
      [run],
    );
    expect(operation.retry).toEqual(retry);
    expect(operation.nextEligibleAt).toBe(nextEligibleAt);
  },
);
