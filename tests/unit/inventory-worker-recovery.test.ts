import { expect, test } from "vitest";
import {
  receiptBindsWorker,
  recoverInventoryWorker,
  trustedOperationWorkerRuns,
} from "../../scripts/automation/inventory-worker.mjs";
import { planAutomationWorker } from "../../scripts/automation/worker.mjs";
import { reconcileAutomation } from "../../scripts/automation/reconcile.mjs";
import { selectDueOperations } from "../../scripts/automation/operation.mjs";
import { planAutomationRetry } from "../../scripts/automation/retry.mjs";
import type { WorkerDiagnosticRun } from "../../scripts/automation/worker-diagnostic.mjs";
import {
  AUTOMATION_NOW,
  operationFixture as baseOperationFixture,
} from "../helpers/automation-fixtures";
import type { AutomationOperation } from "../../scripts/automation/operation.mjs";
function operationFixture(overrides: Partial<AutomationOperation> = {}) {
  return baseOperationFixture({
    ...overrides,
    identity: {
      ...baseOperationFixture().identity,
      kind: "metadata",
      ...overrides.identity,
    },
  });
}

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

test.each([undefined, 0, -1, 1.5, Number.NaN])(
  "pending writer intents remain blockers without an authenticated execution ID: %s",
  (executingWriterRunId) => {
    const operation = operationFixture();
    recoverInventoryWorker(
      operation,
      {
        receipts: [],
        nowMs: AUTOMATION_NOW,
        repository,
        publisherActorId,
        executingWriterRunId,
        runs: [writerRun(operation.key)],
      },
      [],
    );
    expect(operation.workerRunId).toBe(701);
    expect(planAutomationWorker(operation)).toEqual({ action: "wait" });
  },
);

test.each(["in_progress", "unknown"])(
  "another %s writer still blocks an authenticated recipient",
  (status) => {
    const operation = operationFixture();
    recoverInventoryWorker(
      operation,
      {
        receipts: [],
        nowMs: AUTOMATION_NOW,
        repository,
        publisherActorId,
        executingWriterRunId: 800,
        runs: [writerRun(operation.key, { status })],
      },
      [],
    );
    expect(operation.workerRunId).toBe(701);
    expect(planAutomationWorker(operation)).toEqual({ action: "wait" });
  },
);

test.each(["queued", "in_progress"])(
  "a %s preparation worker still blocks an authenticated recipient",
  (status) => {
    const operation = operationFixture();
    const producer = writerRun(operation.key, {
      path: ".github/workflows/automation-worker.yml",
      display_title: `Automation ${operation.key}`,
      status,
    });
    recoverInventoryWorker(
      operation,
      {
        receipts: [],
        nowMs: AUTOMATION_NOW,
        repository,
        publisherActorId,
        executingWriterRunId: 800,
        runs: [producer],
      },
      [producer],
    );
    expect(operation.workerRunId).toBe(701);
    expect(planAutomationWorker(operation)).toEqual({ action: "wait" });
  },
);
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

test.each([
  { savedDeadline: null, boundaryAt: "2026-10-07T11:37:00.000Z" },
  {
    savedDeadline: "2026-10-07T12:05:00.000Z",
    boundaryAt: "2026-10-07T12:05:00.000Z",
  },
])(
  "a successful wrapper without a prior failure fixes recovery after grace and saved deadline: $savedDeadline",
  ({ savedDeadline, boundaryAt }) => {
    const receipt = receiptFixture({
      operation: {
        ...operationFixture(),
        workerRunId: 703,
        nextEligibleAt: savedDeadline,
      },
      updatedAt: "2026-10-07T11:20:00.000Z",
    });
    const wrapper = writerRun(receipt.operation.key, {
      id: 703,
      path: ".github/workflows/automation-worker.yml",
      display_title: `Automation ${receipt.operation.key}`,
      status: "completed",
      conclusion: "success",
      created_at: "2026-10-07T11:21:00.000Z",
      updated_at: "2026-10-07T11:22:00.000Z",
    });
    const retainedBytes = JSON.stringify({ receipt, wrapper });
    const graceAt = Date.parse("2026-10-07T11:37:00.000Z");
    const recovered = [
      graceAt - 1,
      graceAt,
      AUTOMATION_NOW,
      AUTOMATION_NOW + 86_400_001,
    ].map((nowMs) => {
      const operation = operationFixture();
      recoverInventoryWorker(
        operation,
        {
          receipts: [receipt],
          nowMs,
          repository,
          publisherActorId,
          runs: [wrapper],
        },
        [wrapper],
      );
      return operation;
    });

    expect(recovered[0].workerRunId).toBe(703);
    expect(recovered[0].retry).toBeNull();
    expect(planAutomationWorker(recovered[0])).toEqual({ action: "wait" });
    const firstRetryAt = recovered[1].nextEligibleAt;
    expect(
      recovered.slice(1).map((operation) => operation.nextEligibleAt),
    ).toEqual([firstRetryAt, firstRetryAt, firstRetryAt]);
    expect(Date.parse(firstRetryAt!)).toBeGreaterThanOrEqual(
      Date.parse(boundaryAt) + 300_000,
    );
    expect(Date.parse(firstRetryAt!)).toBeLessThanOrEqual(
      Date.parse(boundaryAt) + 330_000,
    );
    for (const operation of recovered.slice(1)) {
      expect(operation.retry).toEqual({
        failure: {
          kind: "transient",
          reasonCode: "workflow-result-unavailable",
        },
        transientAttempts: 0,
        immediateAttempts: 0,
      });
      expect(
        selectDueOperations([operation], {
          nowMs: Date.parse(firstRetryAt!) - 1,
        }),
      ).toEqual([]);
      expect(
        selectDueOperations([operation], { nowMs: Date.parse(firstRetryAt!) }),
      ).toEqual([operation]);
    }
    expect(JSON.stringify({ receipt, wrapper })).toBe(retainedBytes);
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
    Date.parse(wrapper.updated_at!) + 30 * 60_000,
  );
  expect(Date.parse(operation.nextEligibleAt!)).toBeLessThanOrEqual(
    Date.parse(wrapper.updated_at!) + 15 * 60_000 + 990_000,
  );
  const observedAgain = operationFixture();
  recoverInventoryWorker(
    observedAgain,
    { ...input, nowMs: AUTOMATION_NOW + 86_400_001 },
    [wrapper],
  );
  expect(observedAgain.retry).toEqual(operation.retry);
  expect(observedAgain.nextEligibleAt).toBe(operation.nextEligibleAt);

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
    const receipt = receiptFixture({
      operation: {
        ...operation,
        retry: savedRetry,
        nextEligibleAt: deadline,
      },
      updatedAt: new Date(updatedAt).toISOString(),
    });
    const savedBytes = JSON.stringify(receipt);
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
      ...savedRetry,
      transientAttempts,
    });
    expect(operation.nextEligibleAt).toBe(
      lease
        ? new Date(Date.parse(deadline) + 86_400_000).toISOString()
        : deadline,
    );
    const observedAgain = operationFixture();
    recoverInventoryWorker(
      observedAgain,
      {
        receipts: [receipt],
        nowMs: AUTOMATION_NOW + 86_400_001,
        repository,
        publisherActorId,
        runs: [],
      },
      [],
    );
    expect(observedAgain.retry).toEqual(operation.retry);
    expect(observedAgain.nextEligibleAt).toBe(operation.nextEligibleAt);
    expect(JSON.stringify(receipt)).toBe(savedBytes);
  },
);

test("an unchanged expired dispatch lease keeps the unknown daily probe fixed across observation clocks", () => {
  const savedRetry = {
    failure: {
      kind: "unknown" as const,
      reasonCode: "unclassified-failure" as const,
    },
    transientAttempts: 2,
    immediateAttempts: 3,
  };
  const receipt = receiptFixture({
    operation: {
      ...operationFixture(),
      retry: savedRetry,
      nextEligibleAt: "2026-10-07T11:55:00.000Z",
    },
    updatedAt: "2026-10-07T11:40:00.000Z",
  });
  const savedBytes = JSON.stringify(receipt);
  const recovered = [AUTOMATION_NOW, AUTOMATION_NOW + 86_400_001].map(
    (nowMs) => {
      const operation = operationFixture();
      recoverInventoryWorker(
        operation,
        { receipts: [receipt], nowMs, repository, publisherActorId, runs: [] },
        [],
      );
      return operation;
    },
  );

  expect(recovered.map((operation) => operation.nextEligibleAt)).toEqual([
    "2026-10-08T11:55:00.000Z",
    "2026-10-08T11:55:00.000Z",
  ]);
  for (const operation of recovered) {
    expect(operation.retry).toEqual({ ...savedRetry, transientAttempts: 3 });
    expect(
      selectDueOperations([operation], {
        nowMs: Date.parse("2026-10-08T11:54:59.999Z"),
      }),
    ).toEqual([]);
    expect(
      selectDueOperations([operation], {
        nowMs: Date.parse("2026-10-08T11:55:00.000Z"),
      }),
    ).toEqual([operation]);
  }
  expect(
    planAutomationRetry({
      ...recovered[0].retry!,
      nowMs: Date.parse(receipt.operation.nextEligibleAt!),
      jitterSeed: receipt.operation.key,
    }),
  ).toMatchObject({ action: "probe", incident: true });
  expect(JSON.stringify(receipt)).toBe(savedBytes);
});

test("an unchanged dispatch lease starts one fixed retry at expiry without a prior failure", () => {
  const receipt = receiptFixture({
    operation: {
      ...operationFixture(),
      nextEligibleAt: "2026-10-07T11:55:00.000Z",
    },
    updatedAt: "2026-10-07T11:40:00.000Z",
  });
  const savedBytes = JSON.stringify(receipt);
  const leaseExpiry = Date.parse(receipt.operation.nextEligibleAt!);
  const recovered = [
    leaseExpiry - 1,
    leaseExpiry,
    AUTOMATION_NOW,
    AUTOMATION_NOW + 86_400_001,
  ].map((nowMs) => {
    const operation = operationFixture();
    recoverInventoryWorker(
      operation,
      { receipts: [receipt], nowMs, repository, publisherActorId, runs: [] },
      [],
    );
    return operation;
  });

  expect(recovered[0].retry).toBeNull();
  expect(recovered[0].nextEligibleAt).toBe(receipt.operation.nextEligibleAt);
  const firstRetryAt = recovered[1].nextEligibleAt;
  expect(
    recovered.slice(1).map((operation) => operation.nextEligibleAt),
  ).toEqual([firstRetryAt, firstRetryAt, firstRetryAt]);
  expect(Date.parse(firstRetryAt!)).toBeGreaterThanOrEqual(
    leaseExpiry + 300_000,
  );
  expect(Date.parse(firstRetryAt!)).toBeLessThanOrEqual(leaseExpiry + 330_000);
  for (const operation of recovered.slice(1)) {
    expect(operation.retry).toEqual({
      failure: { kind: "transient", reasonCode: "workflow-result-unavailable" },
      transientAttempts: 0,
      immediateAttempts: 0,
    });
    expect(
      selectDueOperations([operation], {
        nowMs: Date.parse(firstRetryAt!) - 1,
      }),
    ).toEqual([]);
    expect(
      selectDueOperations([operation], { nowMs: Date.parse(firstRetryAt!) }),
    ).toEqual([operation]);
  }
  expect(JSON.stringify(receipt)).toBe(savedBytes);
});

test.each(["success", "failure"])(
  "a %s native wrapper retains its retry-after delay and run-attempt jitter seed",
  (conclusion) => {
    const receipt = receiptFixture({
      operation: { ...operationFixture(), workerRunId: 703 },
      updatedAt: "2026-10-07T11:20:00.000Z",
    });
    const nativeTerminalAt = Date.parse("2026-10-07T11:22:00.000Z");
    const expectedBoundary =
      nativeTerminalAt + (conclusion === "success" ? 900_000 : 0);
    const recoveredDeadlines = [1, 2].map((runAttempt) => {
      const wrapper = writerRun(receipt.operation.key, {
        id: 703,
        path: ".github/workflows/automation-worker.yml",
        display_title: `Automation ${receipt.operation.key}`,
        status: "completed",
        conclusion,
        created_at: "2026-10-07T11:21:00.000Z",
        updated_at: "2026-10-07T11:22:00.000Z",
        retryAfterMs: 3_600_000,
        run_attempt: runAttempt,
        automationDiagnostic: {
          schema_version: 1,
          operation_key: receipt.operation.key,
          runId: 703,
          runAttempt,
          sourceSha: "c".repeat(40),
          failure: { kind: "transient", reasonCode: "provider-rate-limited" },
        },
      });
      const retainedBytes = JSON.stringify({ receipt, wrapper });
      const observed = [AUTOMATION_NOW, AUTOMATION_NOW + 86_400_001].map(
        (nowMs) => {
          const operation = operationFixture();
          recoverInventoryWorker(
            operation,
            {
              receipts: [receipt],
              nowMs,
              repository,
              publisherActorId,
              runs: [wrapper],
            },
            [wrapper],
          );
          expect(operation.retry).toEqual({
            failure: {
              kind: "transient",
              reasonCode:
                conclusion === "success"
                  ? "workflow-result-unavailable"
                  : "provider-rate-limited",
            },
            transientAttempts: 0,
            immediateAttempts: 0,
          });
          expect(Date.parse(operation.nextEligibleAt!)).toBeGreaterThanOrEqual(
            expectedBoundary + 3_600_000,
          );
          expect(Date.parse(operation.nextEligibleAt!)).toBeLessThanOrEqual(
            expectedBoundary + 3_960_000,
          );
          return operation.nextEligibleAt;
        },
      );
      expect(observed[1]).toBe(observed[0]);
      expect(JSON.stringify({ receipt, wrapper })).toBe(retainedBytes);
      return observed[0];
    });
    expect(recoveredDeadlines[0]).not.toBe(recoveredDeadlines[1]);
  },
);

test.each(
  ["queued", "pending", "waiting", "requested", "in_progress"].flatMap(
    (status) =>
      ["worker", "producer", "writer"].map((role) => ({ status, role })),
  ),
)(
  "a trusted $status $role blocks missing-result inference across observation clocks",
  ({ status, role }) => {
    const identity = {
      kind: "metadata" as const,
      subject: "source:github-42:example-project",
      inputDigest: "a".repeat(64),
      policyVersion: "1",
    };
    const receipt = receiptFixture({
      operation: {
        ...operationFixture({ identity }),
        retry: {
          failure: { kind: "unknown", reasonCode: "unclassified-failure" },
          transientAttempts: 0,
          immediateAttempts: 3,
        },
        nextEligibleAt: "2026-10-07T11:35:00.000Z",
      },
      updatedAt: "2026-10-07T11:20:00.000Z",
    });
    const peer = writerRun(receipt.operation.key, {
      id: 703,
      status,
      path:
        role === "worker"
          ? ".github/workflows/automation-worker.yml"
          : role === "producer"
            ? ".github/workflows/enrich-catalog.yml"
            : ".github/workflows/automation-writer.yml",
      display_title:
        role === "worker"
          ? `Automation ${receipt.operation.key}`
          : role === "producer"
            ? `Automation prepare ${receipt.operation.key}`
            : `Automation write prepare ${receipt.operation.key}`,
      created_at: "2026-10-07T11:21:00.000Z",
    });
    const retainedBytes = JSON.stringify({ receipt, peer });

    for (const nowMs of [AUTOMATION_NOW, AUTOMATION_NOW + 86_400_001]) {
      const operation = operationFixture({ identity });
      const input = {
        receipts: [receipt],
        nowMs,
        repository,
        publisherActorId,
        runs: [peer],
      };
      recoverInventoryWorker(
        operation,
        input,
        trustedOperationWorkerRuns(input, operation),
      );
      expect(operation.workerRunId).toBe(703);
      expect(operation.retry).toBeNull();
      expect(planAutomationWorker(operation)).toEqual({ action: "wait" });
      expect(selectDueOperations([operation], { nowMs })).toEqual([]);
    }
    expect(JSON.stringify({ receipt, peer })).toBe(retainedBytes);
  },
);

test.each(["queued", "pending", "waiting", "requested", "in_progress"])(
  "the authenticated executing writer keeps its existing %s exception during lease recovery",
  (status) => {
    const receipt = receiptFixture({
      operation: {
        ...operationFixture(),
        retry: {
          failure: { kind: "unknown", reasonCode: "unclassified-failure" },
          transientAttempts: 0,
          immediateAttempts: 3,
        },
        nextEligibleAt: "2026-10-07T11:35:00.000Z",
      },
      updatedAt: "2026-10-07T11:20:00.000Z",
    });
    const writer = writerRun(receipt.operation.key, {
      id: status === "in_progress" ? 703 : 704,
      status,
      created_at: "2026-10-07T11:21:00.000Z",
    });
    const operation = operationFixture();
    recoverInventoryWorker(
      operation,
      {
        receipts: [receipt],
        nowMs: AUTOMATION_NOW,
        repository,
        publisherActorId,
        executingWriterRunId: 703,
        runs: [writer],
      },
      [],
    );
    expect(operation.workerRunId).toBeNull();
    expect(operation.nextEligibleAt).toBe("2026-10-08T11:35:00.000Z");
    expect(operation.retry).toEqual({
      ...receipt.operation.retry,
      transientAttempts: 1,
    });
  },
);

test.each([
  {
    control: "incident 900 genuine saved daily probe",
    failure: { kind: "unknown" as const, reasonCode: "unclassified-failure" },
    transientAttempts: 3,
    immediateAttempts: 4,
    nextEligibleAt: "2026-10-17T06:15:10.132Z",
  },
  {
    control: "provider retry",
    failure: {
      kind: "transient" as const,
      reasonCode: "provider-rate-limited",
    },
    transientAttempts: 2,
    immediateAttempts: 0,
    nextEligibleAt: "2026-10-17T06:15:10.132Z",
  },
  {
    control: "configuration retry",
    failure: {
      kind: "configuration" as const,
      reasonCode: "publisher-authentication-failed",
    },
    transientAttempts: 2,
    immediateAttempts: 0,
    nextEligibleAt: "2026-10-17T06:15:10.132Z",
  },
  {
    control: "permanent stop",
    failure: { kind: "permanent" as const, reasonCode: "authorization-lost" },
    transientAttempts: 2,
    immediateAttempts: 3,
    nextEligibleAt: null,
  },
])(
  "$control retains its saved deadline and counters across clocks and older successful wrappers",
  ({ failure, transientAttempts, immediateAttempts, nextEligibleAt }) => {
    const identity = {
      kind: "advisory" as const,
      subject: "source:github-1028124712:chew1976-dynamic-vars",
      inputDigest:
        "191b5e767ad73690847a98534203d0e4e13d7e869cde6e3736278384e2c3c1ee",
      policyVersion: "2026-07-29",
    };
    const receipt = receiptFixture({
      operation: {
        ...operationFixture({
          identity,
          expectedSha: null,
          createdAt: "2026-10-08T14:39:08.801Z",
        }),
        retry: { failure, transientAttempts, immediateAttempts },
        nextEligibleAt,
      },
      updatedAt: "2026-10-16T06:15:10.132Z",
    });
    expect(receipt.operation.key).toBe(
      "1c3adda5b4ea23180aa6fc3a56873f2d0f404b7f714ae97c54b3d7789bed4493",
    );
    const wrapper = writerRun(receipt.operation.key, {
      id: 703,
      path: ".github/workflows/automation-worker.yml",
      display_title: `Automation ${receipt.operation.key}`,
      status: "completed",
      conclusion: "success",
      created_at: "2026-10-16T06:00:00.000Z",
      updated_at: "2026-10-16T06:05:00.000Z",
    });
    const retainedBytes = JSON.stringify({ receipt, wrapper });
    const deadlineAt = Date.parse("2026-10-17T06:15:10.132Z");

    for (const runs of [[], [wrapper]]) {
      for (const nowMs of [deadlineAt - 1, deadlineAt + 86_400_001]) {
        const operation = operationFixture({ identity, expectedSha: null });
        recoverInventoryWorker(
          operation,
          { receipts: [receipt], nowMs, repository, publisherActorId, runs },
          runs,
        );
        expect(operation.retry).toEqual(receipt.operation.retry);
        expect(operation.nextEligibleAt).toBe(nextEligibleAt);
        expect(selectDueOperations([operation], { nowMs })).toEqual(
          failure.kind === "permanent" || nowMs < deadlineAt ? [] : [operation],
        );
      }
    }
    expect(JSON.stringify({ receipt, wrapper })).toBe(retainedBytes);
  },
);

test.each([
  {
    source: "dispatch lease",
    wrapper: false,
    savedDeadline: "2026-10-07T11:35:00.000Z",
    boundaryAt: "2026-10-07T11:35:00.000Z",
    expectedRetryAt: "2026-10-08T11:35:00.000Z",
  },
  {
    source: "wrapper grace",
    wrapper: true,
    savedDeadline: "2026-10-07T11:35:00.000Z",
    boundaryAt: "2026-10-07T11:37:00.000Z",
    expectedRetryAt: "2026-10-08T11:37:00.000Z",
  },
  {
    source: "later saved wrapper deadline",
    wrapper: true,
    savedDeadline: "2026-10-07T12:05:00.000Z",
    boundaryAt: "2026-10-07T12:05:00.000Z",
    expectedRetryAt: "2026-10-08T12:05:00.000Z",
  },
])(
  "unknown recovery waits through the $source boundary and retains its full daily interval",
  (fixture) => {
    const savedRetry = {
      failure: { kind: "unknown" as const, reasonCode: "unclassified-failure" },
      transientAttempts: 0,
      immediateAttempts: 3,
    };
    const receipt = receiptFixture({
      operation: {
        ...operationFixture(),
        retry: savedRetry,
        nextEligibleAt: fixture.savedDeadline,
      },
      updatedAt: "2026-10-07T11:20:00.000Z",
    });
    const runs = fixture.wrapper
      ? [
          writerRun(receipt.operation.key, {
            id: 703,
            path: ".github/workflows/automation-worker.yml",
            display_title: `Automation ${receipt.operation.key}`,
            status: "completed",
            conclusion: "success",
            created_at: "2026-10-07T11:21:00.000Z",
            updated_at: "2026-10-07T11:22:00.000Z",
          }),
        ]
      : [];
    const retainedBytes = JSON.stringify({ receipt, runs });
    const boundaryAt = Date.parse(fixture.boundaryAt);
    const recovered = [boundaryAt - 1, boundaryAt, boundaryAt + 86_400_001].map(
      (nowMs) => {
        const operation = operationFixture();
        recoverInventoryWorker(
          operation,
          { receipts: [receipt], nowMs, repository, publisherActorId, runs },
          runs,
        );
        return operation;
      },
    );

    expect(recovered[0].retry).toEqual(savedRetry);
    expect(
      selectDueOperations([recovered[0]], { nowMs: boundaryAt - 1 }),
    ).toEqual([]);
    for (const operation of recovered.slice(1)) {
      expect(operation.retry).toEqual({ ...savedRetry, transientAttempts: 1 });
      expect(operation.nextEligibleAt).toBe(fixture.expectedRetryAt);
      expect(selectDueOperations([operation], { nowMs: boundaryAt })).toEqual(
        [],
      );
    }
    expect(JSON.stringify({ receipt, runs })).toBe(retainedBytes);
  },
);

test.each(
  [
    { timing: "missing update", updated_at: undefined, invalidTerminal: false },
    {
      timing: "malformed update",
      updated_at: "invalid",
      invalidTerminal: true,
    },
    {
      timing: "missing creation",
      created_at: undefined,
      invalidTerminal: false,
    },
    {
      timing: "malformed creation",
      created_at: "invalid",
      invalidTerminal: false,
    },
    {
      timing: "update before creation",
      updated_at: "2026-10-07T11:20:30.000Z",
      invalidTerminal: false,
    },
    {
      timing: "both timestamps missing",
      created_at: undefined,
      updated_at: undefined,
      invalidTerminal: true,
    },
  ].flatMap((timing) =>
    [false, true].map((priorFailure) => ({ ...timing, priorFailure })),
  ),
)(
  "successful wrapper timing retains the observation fallback or saved authority: $timing, prior=$priorFailure",
  ({ timing: _timing, invalidTerminal, priorFailure, ...timestamps }) => {
    const savedRetry = {
      failure: { kind: "unknown" as const, reasonCode: "unclassified-failure" },
      transientAttempts: 0,
      immediateAttempts: 3,
    };
    const receipt = receiptFixture({
      operation: {
        ...operationFixture(),
        workerRunId: 703,
        nextEligibleAt: "2026-10-07T11:35:00.000Z",
        retry: priorFailure ? savedRetry : null,
      },
      updatedAt: "2026-10-07T11:20:00.000Z",
    });
    const wrapper = writerRun(receipt.operation.key, {
      id: 703,
      path: ".github/workflows/automation-worker.yml",
      display_title: `Automation ${receipt.operation.key}`,
      status: "completed",
      conclusion: "success",
      created_at: "2026-10-07T11:21:00.000Z",
      updated_at: "2026-10-07T11:22:00.000Z",
      ...timestamps,
    });
    const retainedBytes = JSON.stringify({ receipt, wrapper });

    for (const nowMs of [AUTOMATION_NOW, AUTOMATION_NOW + 86_400_001]) {
      const operation = operationFixture();
      recoverInventoryWorker(
        operation,
        {
          receipts: [receipt],
          nowMs,
          repository,
          publisherActorId,
          runs: [wrapper],
        },
        [wrapper],
      );
      expect(operation.nextEligibleAt).not.toBeNull();
      if (priorFailure && invalidTerminal) {
        expect(operation.retry).toEqual(savedRetry);
        expect(operation.nextEligibleAt).toBe(receipt.operation.nextEligibleAt);
      } else {
        expect(Date.parse(operation.nextEligibleAt!)).toBeGreaterThan(nowMs);
        expect(selectDueOperations([operation], { nowMs })).toEqual([]);
        if (priorFailure) {
          expect(operation.retry).toEqual({
            ...savedRetry,
            transientAttempts: 1,
          });
          expect(operation.nextEligibleAt).toBe(
            new Date(nowMs + 86_400_000).toISOString(),
          );
        } else {
          expect(operation.retry).toEqual({
            failure: {
              kind: "transient",
              reasonCode: "workflow-result-unavailable",
            },
            transientAttempts: 0,
            immediateAttempts: 0,
          });
          expect(Date.parse(operation.nextEligibleAt!)).toBeGreaterThanOrEqual(
            nowMs + 300_000,
          );
          expect(Date.parse(operation.nextEligibleAt!)).toBeLessThanOrEqual(
            nowMs + 330_000,
          );
        }
      }
    }
    expect(JSON.stringify({ receipt, wrapper })).toBe(retainedBytes);
  },
);

test.each([
  {
    incident: 923,
    key: "0d7a0c3f4f16601d5cf059719cb683c3753b29ab930d4330ed1ef22618910534",
    subject: "source:github-1289246212:mignon-ui-mignon-ui",
    inputDigest:
      "1304b5b234c908f5b1d59805b3c41421c5c180e40da6be950725b6ef87695ad1",
    createdAt: "2026-10-15T12:47:58.849Z",
    dispatchedAt: "2026-10-11T04:45:03.578Z",
    leaseAt: "2026-10-11T05:00:03.578Z",
    runId: 38_112_791_150,
    runCreatedAt: "2026-10-11T04:49:20.000Z",
    terminalAt: "2026-10-11T04:52:19.000Z",
    expectedRetryAt: "2026-10-12T05:07:19.000Z",
  },
  {
    incident: 925,
    key: "04349eb4bd3d883179dd0f1a2b569d48784ec2dbd43b527c2b84d0ca2ccc3b3e",
    subject: "source:github-1179141243:carlosnahuelcoy-sillytavern-player2",
    inputDigest:
      "849f31f217940797613472bcb177742aac9a0cb5f2d6cfe068087fd76f3b40b8",
    createdAt: "2026-10-08T14:39:08.801Z",
    dispatchedAt: "2026-10-10T21:04:44.392Z",
    leaseAt: "2026-10-10T21:19:44.392Z",
    runId: 38_086_429_553,
    runCreatedAt: "2026-10-10T21:07:49.000Z",
    terminalAt: "2026-10-10T21:10:43.000Z",
    expectedRetryAt: "2026-10-11T21:25:43.000Z",
  },
])(
  "native-shaped incident $incident binds its successful wrapper and fixes the daily probe across clocks",
  (fixture) => {
    const identity = {
      kind: "metadata" as const,
      subject: fixture.subject,
      inputDigest: fixture.inputDigest,
      policyVersion: "2026-07-29",
    };
    const savedRetry = {
      failure: { kind: "unknown" as const, reasonCode: "unclassified-failure" },
      transientAttempts: 0,
      immediateAttempts: 3,
    };
    const receipt = receiptFixture({
      operation: {
        ...operationFixture({
          identity,
          expectedSha: null,
          createdAt: "2026-10-08T14:39:08.801Z",
        }),
        retry: savedRetry,
        nextEligibleAt: fixture.leaseAt,
      },
      updatedAt: fixture.dispatchedAt,
    });
    const wrapper = writerRun(fixture.key, {
      id: fixture.runId,
      path: ".github/workflows/automation-worker.yml",
      display_title: `Automation ${fixture.key}`,
      actor: { id: 317_929_880, type: "Bot" },
      status: "completed",
      conclusion: "success",
      run_attempt: 1,
      created_at: fixture.runCreatedAt,
      updated_at: fixture.terminalAt,
    });
    const retainedBytes = JSON.stringify({ receipt, wrapper });
    const observationAt = Date.parse("2026-10-16T17:28:07.730Z");
    const recovered = [observationAt, observationAt + 86_400_001].map(
      (nowMs) => {
        const operation = operationFixture({
          identity,
          expectedSha: null,
          createdAt: fixture.createdAt,
        });
        const input = {
          receipts: [receipt],
          nowMs,
          repository,
          publisherActorId: 317_929_880,
          runs: [wrapper],
        };
        const trustedRuns = trustedOperationWorkerRuns(input, operation);
        expect(operation.key).toBe(fixture.key);
        expect(trustedRuns).toEqual([wrapper]);
        expect(receiptBindsWorker(wrapper, receipt)).toBe(true);
        recoverInventoryWorker(operation, input, trustedRuns);
        return operation;
      },
    );

    for (const operation of recovered) {
      expect(operation.nextEligibleAt).toBe(fixture.expectedRetryAt);
      expect(operation.retry).toEqual({ ...savedRetry, transientAttempts: 1 });
      expect(operation.workerRunId).toBeNull();
      expect(
        selectDueOperations([operation], {
          nowMs: Date.parse(fixture.expectedRetryAt) - 1,
        }),
      ).toEqual([]);
      expect(
        selectDueOperations([operation], {
          nowMs: Date.parse(fixture.expectedRetryAt),
        }),
      ).toEqual([operation]);
    }
    expect(JSON.stringify({ receipt, wrapper })).toBe(retainedBytes);
  },
);
