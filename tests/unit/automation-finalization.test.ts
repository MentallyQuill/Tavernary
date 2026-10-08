import { expect, test, vi } from "vitest";
import { finalizeAutomationOperation } from "../../scripts/automation/finalization.mjs";
import {
  AUTOMATION_NOW,
  operationFixture,
} from "../helpers/automation-fixtures";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
import { runPublicationWriterFinalization } from "../../scripts/automation/writer-runtime.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";

test("the native writer finishes confirmed deployment bookkeeping without a second publication or any GitHub projection", async () => {
  const identity = {
    kind: "deployment" as const,
    subject: `revision:${"b".repeat(40)}`,
    inputDigest: "a".repeat(64),
    policyVersion: "1",
  };
  let operation = operationFixture({ identity, stage: "deployment-confirmed" });
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 4624827,
    nowMs: AUTOMATION_NOW,
    receipts: [],
    operations: [operation],
    local: { revision: "b".repeat(40) },
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: "b".repeat(40) },
  };
  const env = {
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: state.repository,
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: "2625904",
    GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
  };
  const gh = vi.fn(async () => {
    throw new Error("No deployment or notification required");
  });
  const persist = vi.fn(async (receipt: AutomationReceipt) => {
    operation = receipt.operation;
    state.operations = [operation];
    state.receipts = [receipt];
  });
  const input = {
    operationKey: operation.key,
    env,
    gh,
    load: async () => state,
    persist,
  };
  expect(await runPublicationWriterFinalization(input)).toEqual({
    status: "finalized",
  });
  expect(await runPublicationWriterFinalization(input)).toEqual({
    status: "already-finalized",
  });
  expect(persist).toHaveBeenCalledTimes(1);
  expect(gh).not.toHaveBeenCalled();
  await expect(
    runPublicationWriterFinalization({
      ...input,
      env: {
        ...env,
        GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/deploy-pages.yml@refs/heads/main`,
      },
    }),
  ).rejects.toThrow("custody");
  expect(persist).toHaveBeenCalledTimes(1);
});

function fixture() {
  let operation = operationFixture({ stage: "deployment-confirmed" });
  const receipts: AutomationReceipt[] = [];
  const project = vi.fn(async () => ({ status: "complete" as const }));
  const persist = vi.fn(async (receipt: AutomationReceipt) => {
    receipts.push(receipt);
    operation = receipt.operation;
  });
  return {
    operationKey: operation.key,
    load: async () => ({
      operations: [operation],
      receipts,
      nowMs: AUTOMATION_NOW,
    }),
    project,
    persist,
    replace: (value: typeof operation) => {
      operation = value;
    },
    operation: () => operation,
  };
}

test("finalization resumes after a projection failure without changing the published revision and then replays without writes", async () => {
  const input = fixture();
  const revision = input.operation().expectedSha;
  input.project.mockRejectedValueOnce(
    new Error("notice temporarily unavailable"),
  );
  await expect(finalizeAutomationOperation(input)).rejects.toThrow(
    "temporarily unavailable",
  );
  expect(input.persist).not.toHaveBeenCalled();
  expect(await finalizeAutomationOperation(input)).toEqual({
    status: "finalized",
  });
  expect(input.operation()).toMatchObject({
    stage: "finalized",
    expectedSha: revision,
  });
  expect(await finalizeAutomationOperation(input)).toEqual({
    status: "already-finalized",
  });
  expect(input.project).toHaveBeenCalledTimes(2);
  expect(input.persist).toHaveBeenCalledTimes(1);
});

test("publication alone and a lost fresh confirmation cannot finish a lifecycle", async () => {
  const input = fixture();
  input.replace({ ...input.operation(), stage: "published" });
  expect(await finalizeAutomationOperation(input)).toEqual({
    status: "waiting",
  });
  expect(input.project).not.toHaveBeenCalled();
  input.replace({ ...input.operation(), stage: "deployment-confirmed" });
  input.project.mockImplementationOnce(async () => {
    input.replace({ ...input.operation(), stage: "published" });
    return { status: "complete" };
  });
  expect(await finalizeAutomationOperation(input)).toEqual({
    status: "waiting",
  });
  expect(input.persist).not.toHaveBeenCalled();
});
test("a deferred finalization cannot bypass its saved notice retry delay", async () => {
  const input = fixture();
  input.replace({
    ...input.operation(),
    retry: {
      failure: { kind: "transient", reasonCode: "provider-unavailable" },
      transientAttempts: 0,
      immediateAttempts: 0,
    },
    nextEligibleAt: new Date(AUTOMATION_NOW + 300000).toISOString(),
  });
  expect(await finalizeAutomationOperation(input)).toEqual({
    status: "waiting",
  });
  expect(input.project).not.toHaveBeenCalled();
  expect(input.persist).not.toHaveBeenCalled();
});

test("incomplete external projections stay pending; superseded input can finish its historical bookkeeping", async () => {
  const input = fixture();
  input.project.mockResolvedValueOnce({ status: "waiting" } as never);
  expect(await finalizeAutomationOperation(input)).toEqual({
    status: "waiting",
  });
  expect(input.persist).not.toHaveBeenCalled();
  input.project.mockResolvedValueOnce({ status: "superseded" } as never);
  expect(await finalizeAutomationOperation(input)).toEqual({
    status: "finalized",
  });
  expect(input.persist).toHaveBeenCalledTimes(1);
});
