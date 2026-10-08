import { expect, test } from "vitest";
import {
  planAutomationWorker,
  runAutomationWorker,
} from "../../scripts/automation/worker.mjs";
import { operationFixture } from "../helpers/automation-fixtures";

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
  const operation = operationFixture({ stage: "published" });
  expect(planAutomationWorker(operation)).toMatchObject({
    action: "dispatch",
    workflow: "deploy-pages.yml",
    inputs: { source_sha: operation.expectedSha },
  });
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

test("model work requires a budget ticket while source refresh stays independently available", () => {
  const identity = {
    kind: "metadata" as const,
    subject: "source:github-42:example-project",
    inputDigest: "a".repeat(64),
    policyVersion: "1",
  };
  expect(() => planAutomationWorker(operationFixture({ identity }))).toThrow();
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
