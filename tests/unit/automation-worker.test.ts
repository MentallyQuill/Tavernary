import { expect, test } from "vitest";
import {
  planAutomationWorker,
  runAutomationWorker,
  loadAutomationWorkerOperations,
} from "../../scripts/automation/worker.mjs";
import {
  operationFixture,
  projectInventoryFixture,
  receiptFixture,
} from "../helpers/automation-fixtures";
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";

test("a stale confirmed receipt cannot redispatch normal work from a sparse inventory after worker exclusions", async () => {
  const input = projectInventoryFixture({ generationRun: { id: 702 } });
  const operation = discoverProjectOperations(input)[0];
  const receipt = receiptFixture({
    operation: {
      ...operation,
      stage: "deployment-confirmed",
      expectedSha: "d".repeat(40),
      workerRunId: 900,
    },
  });
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    nowMs: input.nowMs,
    publisherActorId: input.publisherActorId,
    receipts: [receipt],
    operations: [receipt.operation],
    remote: {
      issues: input.issues,
      pulls: [],
      runs: [],
      mainHeadSha: "b".repeat(40),
      finalizationOperationKey: operation.key,
    },
    local: {
      projects: input.catalog.projects,
      sources: input.catalog.sources,
      snapshots: [],
      kits: [],
      deployments: [],
      blockedUsers: { blocked: [] },
      revision: "b".repeat(40),
      metadataState: [],
      advisoryState: [],
    },
  };
  const loads: (string | undefined)[] = [];
  const operations = await loadAutomationWorkerOperations({
    operationKey: operation.key,
    runId: 900,
    load: async (key) => {
      loads.push(key);
      return key
        ? state
        : {
            ...state,
            remote: {
              ...state.remote,
              finalizationOperationKey: undefined,
              runs: input.runs,
            },
          };
    },
  });
  const result = await runAutomationWorker({
    operationKey: operation.key,
    load: async () => operations,
    gh: async () => {
      throw new Error("Active replacement producer must prevent dispatch.");
    },
  });
  expect(result).toEqual({ action: "wait" });
  expect(loads).toEqual([operation.key, undefined]);
});

test("worker dispatch uses the current reconstructed operation and never a receipt as authority", async () => {
  const operation = operationFixture();
  const calls: string[][] = [];
  const result = await runAutomationWorker({
    operationKey: operation.key,
    load: async () => [operation],
    gh: async (args) => {
      calls.push(args);
      return "";
    },
  });
  expect(result.action).toBe("dispatch");
  expect(calls[0]).toContain("triage-submission.yml");
  expect(calls[0]).toContain("issue_number=42");
  const stale = await runAutomationWorker({
    operationKey: operation.key,
    load: async () => [],
    gh: async () => {
      throw new Error("Should not dispatch");
    },
  });
  expect(stale.action).toBe("superseded");
});

test("canonical publication advances to deployment without another generation", () => {
  const operation = operationFixture({
    stage: "published",
    identity: {
      kind: "deployment",
      subject: `revision:${"b".repeat(40)}`,
      inputDigest: "a".repeat(64),
      policyVersion: "1",
    },
  });
  expect(planAutomationWorker(operation)).toMatchObject({
    action: "dispatch",
    workflow: "deploy-pages.yml",
    inputs: { source_sha: operation.expectedSha },
  });
});
test("published domain operations wait for the coalesced deployment instead of dispatching duplicate Pages builds", () => {
  expect(
    planAutomationWorker(operationFixture({ stage: "published" })),
  ).toEqual({ action: "wait" });
  expect(
    planAutomationWorker(operationFixture({ stage: "deployment-requested" })),
  ).toEqual({ action: "wait" });
});

test.each(["kit", "withdrawal"] as const)(
  "%s preparation carries its current immutable operation key",
  (kind) => {
    const operation = operationFixture({
      stage: "validated",
      identity: {
        kind,
        subject: "issue:42",
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
    });
    expect(planAutomationWorker(operation)).toMatchObject({
      action: "dispatch",
      inputs: { issue_number: "42", operation_key: operation.key },
    });
  },
);

test("active workers and permanent failures remain protected", () => {
  expect(
    planAutomationWorker(operationFixture({ workerRunId: 700 })).action,
  ).toBe("wait");
  expect(
    planAutomationWorker(
      operationFixture({
        retry: {
          failure: { kind: "permanent", reasonCode: "authorization-lost" },
          transientAttempts: 0,
          immediateAttempts: 0,
        },
      }),
    ).action,
  ).toBe("wait");
});

test("confirmed deployment routes finalization through the privileged writer", () => {
  const operation = operationFixture({ stage: "deployment-confirmed" });
  expect(planAutomationWorker(operation)).toMatchObject({
    workflow: "automation-writer.yml",
    inputs: { mode: "finalize", operation_key: operation.key },
  });
});

test("model work requests writer-owned reservation while source refresh stays independently available", () => {
  const identity = {
    kind: "metadata" as const,
    subject: "source:github-42:example-project",
    inputDigest: "a".repeat(64),
    policyVersion: "1",
  };
  const operation = operationFixture({ identity });
  expect(planAutomationWorker(operation)).toEqual({
    action: "dispatch",
    workflow: "automation-writer.yml",
    inputs: { mode: "prepare", operation_key: operation.key },
  });
  const refresh = operationFixture({
    identity: { ...identity, kind: "refresh", subject: "source:github-42" },
  });
  expect(planAutomationWorker(refresh)).toMatchObject({
    workflow: "refresh-catalog.yml",
    inputs: {
      operation_key: refresh.key,
      mode: "project",
      source_id: "github-42",
    },
  });
});
