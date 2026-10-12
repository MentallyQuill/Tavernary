import { expect, test } from "vitest";
import { recoverInventoryWorker } from "../../scripts/automation/inventory-worker.mjs";
import { planAutomationWorker } from "../../scripts/automation/worker.mjs";
import { reconcileAutomation } from "../../scripts/automation/reconcile.mjs";
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

test("a saved provider retry survives a newer successful dispatch wrapper", () => {
  const operation = operationFixture();
  const retry = {
    failure: {
      kind: "transient" as const,
      reasonCode: "provider-rate-limited",
    },
    transientAttempts: 2,
    immediateAttempts: 0,
  };
  const nextEligibleAt = new Date(AUTOMATION_NOW + 15 * 60_000).toISOString();
  const receipt = receiptFixture({
    operation: { ...operation, workerRunId: 699, retry, nextEligibleAt },
    updatedAt: new Date(AUTOMATION_NOW - 45 * 60_000).toISOString(),
  });
  const wrapper = writerRun(operation.key, {
    id: 702,
    path: ".github/workflows/automation-worker.yml",
    display_title: `Automation ${operation.key}`,
    status: "completed",
    conclusion: "success",
    created_at: new Date(AUTOMATION_NOW - 40 * 60_000).toISOString(),
    updated_at: new Date(AUTOMATION_NOW - 39 * 60_000).toISOString(),
  });

  recoverInventoryWorker(
    operation,
    {
      receipts: [receipt],
      nowMs: AUTOMATION_NOW,
      repository,
      publisherActorId,
      runs: [wrapper],
    },
    [wrapper],
  );

  expect(operation.retry).toEqual(retry);
  expect(operation.nextEligibleAt).toBe(nextEligibleAt);
});

test("a successful wrapper without a result receives a bounded transient retry", () => {
  const operation = operationFixture();
  const wrapper = writerRun(operation.key, {
    id: 702,
    path: ".github/workflows/automation-worker.yml",
    display_title: `Automation ${operation.key}`,
    status: "completed",
    conclusion: "success",
    created_at: new Date(AUTOMATION_NOW - 40 * 60_000).toISOString(),
    updated_at: new Date(AUTOMATION_NOW - 39 * 60_000).toISOString(),
  });

  recoverInventoryWorker(
    operation,
    {
      receipts: [
        receiptFixture({
          operation: { ...operation, workerRunId: 702 },
          updatedAt: new Date(AUTOMATION_NOW - 45 * 60_000).toISOString(),
        }),
      ],
      nowMs: AUTOMATION_NOW,
      repository,
      publisherActorId,
      runs: [wrapper],
    },
    [wrapper],
  );

  expect(operation.retry).toEqual({
    failure: {
      kind: "transient",
      reasonCode: "workflow-result-unavailable",
    },
    transientAttempts: 0,
    immediateAttempts: 0,
  });
  const eligibleAt = Date.parse(operation.nextEligibleAt!);
  expect(eligibleAt).toBeGreaterThan(Date.parse(wrapper.updated_at!) + 300_000);
  expect(eligibleAt).toBeLessThanOrEqual(
    Date.parse(wrapper.updated_at!) + 86_400_000,
  );
});

test("a new successful wrapper advances missing-result retry once", () => {
  const operation = operationFixture();
  const previousRetry = {
    failure: {
      kind: "transient" as const,
      reasonCode: "workflow-result-unavailable",
    },
    transientAttempts: 0,
    immediateAttempts: 0,
  };
  const dispatchedAt = AUTOMATION_NOW - 20 * 60_000;
  const wrapper = writerRun(operation.key, {
    id: 703,
    path: ".github/workflows/automation-worker.yml",
    display_title: `Automation ${operation.key}`,
    status: "completed",
    conclusion: "success",
    created_at: new Date(dispatchedAt + 60_000).toISOString(),
    updated_at: new Date(dispatchedAt + 2 * 60_000).toISOString(),
  });
  const receipt = receiptFixture({
    operation: {
      ...operation,
      workerRunId: wrapper.id!,
      retry: previousRetry,
      nextEligibleAt: new Date(dispatchedAt + 15 * 60_000).toISOString(),
    },
    updatedAt: new Date(dispatchedAt).toISOString(),
  });
  const input = {
    receipts: [receipt],
    nowMs: AUTOMATION_NOW,
    repository,
    publisherActorId,
    runs: [wrapper],
  };

  recoverInventoryWorker(operation, input, [wrapper]);

  expect(operation.retry).toEqual({
    ...previousRetry,
    transientAttempts: 1,
  });
  expect(Date.parse(operation.nextEligibleAt!)).toBeGreaterThan(
    AUTOMATION_NOW + 15 * 60_000,
  );

  const recoveredAgain = operationFixture();
  recoverInventoryWorker(
    recoveredAgain,
    {
      ...input,
      receipts: [
        receiptFixture({
          operation: { ...operation },
          updatedAt: new Date(AUTOMATION_NOW).toISOString(),
        }),
      ],
      nowMs: Date.parse(operation.nextEligibleAt!) + 60_000,
    },
    [wrapper],
  );
  expect(recoveredAgain.retry).toEqual(operation.retry);
  expect(recoveredAgain.nextEligibleAt).toBe(operation.nextEligibleAt);
});

test("a recent successful wrapper keeps a saved retry behind its grace lease", () => {
  const operation = operationFixture();
  const retry = {
    failure: {
      kind: "transient" as const,
      reasonCode: "provider-rate-limited",
    },
    transientAttempts: 1,
    immediateAttempts: 0,
  };
  const wrapper = writerRun(operation.key, {
    id: 704,
    path: ".github/workflows/automation-worker.yml",
    display_title: `Automation ${operation.key}`,
    status: "completed",
    conclusion: "success",
    created_at: new Date(AUTOMATION_NOW - 3 * 60_000).toISOString(),
    updated_at: new Date(AUTOMATION_NOW - 2 * 60_000).toISOString(),
  });
  recoverInventoryWorker(
    operation,
    {
      receipts: [
        receiptFixture({
          operation: {
            ...operation,
            retry,
            nextEligibleAt: new Date(AUTOMATION_NOW - 60_000).toISOString(),
          },
          updatedAt: new Date(AUTOMATION_NOW - 4 * 60_000).toISOString(),
        }),
      ],
      nowMs: AUTOMATION_NOW,
      repository,
      publisherActorId,
      runs: [wrapper],
    },
    [wrapper],
  );

  expect(operation.retry).toEqual(retry);
  expect(operation.workerRunId).toBe(704);
  expect(Date.parse(operation.nextEligibleAt!)).toBeGreaterThan(AUTOMATION_NOW);
  expect(planAutomationWorker(operation)).toEqual({ action: "wait" });
});

test("an expired dispatch lease without a visible result starts bounded transient recovery", () => {
  const operation = operationFixture();
  const dispatchedAt = AUTOMATION_NOW - 20 * 60_000;
  const receipt = receiptFixture({
    operation: {
      ...operation,
      nextEligibleAt: new Date(dispatchedAt + 15 * 60_000).toISOString(),
    },
    updatedAt: new Date(dispatchedAt).toISOString(),
  });
  recoverInventoryWorker(
    operation,
    {
      receipts: [receipt],
      nowMs: AUTOMATION_NOW,
      repository,
      publisherActorId,
      runs: [],
    },
    [],
  );
  expect(operation.retry).toEqual({
    failure: {
      kind: "transient",
      reasonCode: "workflow-result-unavailable",
    },
    transientAttempts: 0,
    immediateAttempts: 0,
  });
  expect(Date.parse(operation.nextEligibleAt!)).toBeGreaterThan(AUTOMATION_NOW);
  expect(Date.parse(operation.nextEligibleAt!)).toBeLessThanOrEqual(
    AUTOMATION_NOW + 86_400_000,
  );
});

test("lost dispatches without visible runs advance one bounded retry per expired lease", async () => {
  const base = operationFixture();
  const dispatchedAt = AUTOMATION_NOW - 20 * 60_000;
  let receipt = receiptFixture({
    operation: {
      ...base,
      nextEligibleAt: new Date(dispatchedAt + 15 * 60_000).toISOString(),
    },
    updatedAt: new Date(dispatchedAt).toISOString(),
  });
  let dispatches = 0;
  const discover = (nowMs: number) => {
    const operation = operationFixture();
    recoverInventoryWorker(
      operation,
      {
        receipts: [receipt],
        nowMs,
        repository,
        publisherActorId,
        runs: [],
      },
      [],
    );
    return operation;
  };
  const reconcileAt = async (nowMs: number) =>
    reconcileAutomation({
      nowMs,
      inventory: async () => [discover(nowMs)],
      receipts: [receipt],
      persist: async (value) => {
        receipt = value;
      },
      dispatch: async () => {
        dispatches++;
        return { workerRunId: null };
      },
    });

  await reconcileAt(AUTOMATION_NOW);
  const initialBackoff = receipt.operation.nextEligibleAt!;
  expect(receipt.operation.retry).toMatchObject({
    failure: { kind: "transient", reasonCode: "workflow-result-unavailable" },
    transientAttempts: 0,
    immediateAttempts: 0,
  });
  const firstDispatchAt = Date.parse(initialBackoff) + 1;
  await reconcileAt(firstDispatchAt);
  expect(dispatches).toBe(1);
  const firstLeaseExpiry = Date.parse(receipt.operation.nextEligibleAt!);
  expect(firstLeaseExpiry).toBe(firstDispatchAt + 15 * 60_000);

  const firstLostAt = firstLeaseExpiry + 1;
  await reconcileAt(firstLostAt);
  expect(dispatches).toBe(1);
  expect(receipt.operation.retry).toMatchObject({
    failure: { kind: "transient", reasonCode: "workflow-result-unavailable" },
    transientAttempts: 1,
    immediateAttempts: 0,
  });
  expect(Date.parse(receipt.operation.nextEligibleAt!)).toBeGreaterThan(
    firstLostAt,
  );
  const savedBackoff = receipt.operation.nextEligibleAt;
  await reconcileAt(firstLostAt + 60_000);
  expect(receipt.operation.retry?.transientAttempts).toBe(1);
  expect(receipt.operation.nextEligibleAt).toBe(savedBackoff);
  expect(dispatches).toBe(1);

  const secondDispatchAt = Date.parse(savedBackoff!) + 1;
  await reconcileAt(secondDispatchAt);
  expect(dispatches).toBe(2);
  const secondLostAt = Date.parse(receipt.operation.nextEligibleAt!) + 1;
  await reconcileAt(secondLostAt);
  expect(dispatches).toBe(2);
  expect(receipt.operation.retry?.transientAttempts).toBe(2);
  expect(receipt.operation.retry?.immediateAttempts).toBe(0);
  expect(Date.parse(receipt.operation.nextEligibleAt!)).toBeGreaterThan(
    secondLostAt,
  );
});

test.each([
  { lease: true, transientAttempts: 3 },
  { lease: false, transientAttempts: 2 },
])(
  "a genuine unknown receipt keeps its failure authority without a visible run: %j",
  ({ lease, transientAttempts }) => {
    const operation = operationFixture();
    const savedRetry = {
      failure: {
        kind: "unknown" as const,
        reasonCode: "unclassified-failure" as const,
      },
      transientAttempts: 2,
      immediateAttempts: 3,
    };
    const updatedAt = AUTOMATION_NOW - 20 * 60_000;
    const deadline = new Date(
      updatedAt + (lease ? 15 : 5) * 60_000,
    ).toISOString();
    recoverInventoryWorker(
      operation,
      {
        receipts: [
          receiptFixture({
            operation: {
              ...operation,
              retry: savedRetry,
              nextEligibleAt: deadline,
            },
            updatedAt: new Date(updatedAt).toISOString(),
          }),
        ],
        nowMs: AUTOMATION_NOW,
        repository,
        publisherActorId,
        runs: [],
      },
      [],
    );
    expect(operation.retry).toEqual({
      ...savedRetry,
      transientAttempts,
    });
    expect(operation.nextEligibleAt).toBe(
      lease ? new Date(AUTOMATION_NOW + 86_400_000).toISOString() : deadline,
    );
  },
);
