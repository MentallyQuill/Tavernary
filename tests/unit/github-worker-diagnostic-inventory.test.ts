import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { loadGithubAutomationInventory } from "../../scripts/automation/github-inventory.mjs";
import {
  AUTOMATION_NOW,
  receiptFixture,
  operationFixture,
} from "../helpers/automation-fixtures";
import { operationKey } from "../../scripts/automation/operation.mjs";

test.each([false, true])(
  "inventory attaches a newer native failure diagnostic despite a prior classified retry (%s)",
  async (previousFailure) => {
    const repository = "MentallyQuill/Tavernary";
    const publisherActorId = 317929880;
    const receipt = receiptFixture();
    receipt.operation.workerRunId = 702;
    if (previousFailure)
      receipt.operation.retry = {
        failure: { kind: "transient", reasonCode: "provider-unavailable" },
        transientAttempts: 1,
        immediateAttempts: 0,
      };
    const run = {
      id: 702,
      run_attempt: 1,
      path: ".github/workflows/automation-worker.yml",
      event: "workflow_dispatch",
      head_branch: "main",
      head_sha: "c".repeat(40),
      repository: { id: 42, full_name: repository },
      head_repository: { id: 42, full_name: repository },
      actor: { id: publisherActorId, type: "Bot" },
      display_title: `Automation ${receipt.operation.key}`,
      status: "completed",
      conclusion: "failure",
      created_at: "2026-10-08T11:58:00Z",
      updated_at: "2026-10-08T12:00:00Z",
    };
    const value = {
      schema_version: 1,
      operation_key: receipt.operation.key,
      failure: {
        kind: "configuration",
        reasonCode: "publisher-authentication-failed",
      },
    };
    const archive = zipSync({
      "automation-diagnostic.json": strToU8(JSON.stringify(value)),
    });
    const artifact = {
      id: 900,
      name: "automation-diagnostic-702",
      expired: false,
      size_in_bytes: archive.byteLength,
      digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
      created_at: "2026-10-08T11:59:00Z",
      workflow_run: {
        id: 702,
        repository_id: 42,
        head_repository_id: 42,
        head_branch: "main",
        head_sha: run.head_sha,
      },
    };
    const inventory = await loadGithubAutomationInventory({
      repository,
      publisherActorId,
      receipts: [receipt],
      nowMs: AUTOMATION_NOW,
      downloadDiagnostic: async () => archive,
      gh: async (args) => {
        const path = args.find((arg) => arg.startsWith("repos/"))!;
        if (path.endsWith("/git/ref/heads/main"))
          return JSON.stringify({ object: { sha: "d".repeat(40) } });
        if (path.endsWith("/actions/runs/702/artifacts"))
          return JSON.stringify([{ total_count: 1, artifacts: [artifact] }]);
        if (path.endsWith("/actions/runs"))
          return JSON.stringify([
            {
              total_count: args.some((arg) => arg.startsWith("status="))
                ? 0
                : 1,
              workflow_runs: args.some((arg) => arg.startsWith("status="))
                ? []
                : [run],
            },
          ]);
        if (path.endsWith("/issues/42"))
          return JSON.stringify({ number: 42, state: "closed", labels: [] });
        return JSON.stringify([[]]);
      },
    });
    expect(inventory.runs[0]).toMatchObject({
      automationDiagnostic: {
        ...value,
        runId: 702,
        runAttempt: 1,
        sourceSha: "c".repeat(40),
      },
    });
  },
);

test("duplicate failure history reads one bound diagnostic and ignores obsolete failures after success", async () => {
  const repository = "MentallyQuill/Tavernary",
    publisherActorId = 317929880;
  const receipt = receiptFixture();
  receipt.operation.workerRunId = 702;
  const failed = {
    id: 702,
    run_attempt: 1,
    path: ".github/workflows/automation-worker.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "c".repeat(40),
    repository: { id: 42, full_name: repository },
    head_repository: { id: 42, full_name: repository },
    actor: { id: publisherActorId, type: "Bot" },
    display_title: `Automation ${receipt.operation.key}`,
    status: "completed",
    conclusion: "failure",
    created_at: "2026-10-08T11:58:00Z",
    updated_at: "2026-10-08T12:00:00Z",
  };
  const history = Array.from({ length: 180 }, (_, index) => ({
    ...failed,
    id: 702 + index,
  }));
  let artifactCalls = 0;
  const gh = async (args: string[]) => {
    const path = args.find((arg) => arg.startsWith("repos/"))!;
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "d".repeat(40) } });
    if (path.endsWith("/artifacts")) {
      artifactCalls++;
      return JSON.stringify([{ total_count: 0, artifacts: [] }]);
    }
    if (path.endsWith("/actions/runs")) {
      const rows = args.some((arg) => arg.startsWith("status=")) ? [] : history;
      const page = Number(args.find((arg) => /^page=/u.test(arg))!.slice(5));
      return JSON.stringify([
        {
          total_count: rows.length,
          workflow_runs: rows.slice((page - 1) * 100, page * 100),
        },
      ]);
    }
    if (path.endsWith("/issues/42"))
      return JSON.stringify({ number: 42, state: "closed", labels: [] });
    return JSON.stringify([[]]);
  };
  const result = await loadGithubAutomationInventory({
    repository,
    publisherActorId,
    receipts: [receipt],
    nowMs: AUTOMATION_NOW,
    gh,
  });
  expect(result.runs).toHaveLength(180);
  expect(artifactCalls).toBe(1);
  artifactCalls = 0;
  history.push({ ...failed, id: 900, conclusion: "success" });
  expect(
    (
      await loadGithubAutomationInventory({
        repository,
        publisherActorId,
        receipts: [receipt],
        nowMs: AUTOMATION_NOW,
        gh,
      })
    ).runs,
  ).toHaveLength(181);
  expect(artifactCalls).toBe(0);
  history.pop();
  receipt.updatedAt = "2026-10-09T12:00:00.000Z";
  receipt.operation.workerRunId = null;
  receipt.operation.retry = {
    failure: { kind: "unknown", reasonCode: "unclassified-failure" },
    transientAttempts: 0,
    immediateAttempts: 1,
  };
  await loadGithubAutomationInventory({
    repository,
    publisherActorId,
    receipts: [receipt],
    nowMs: AUTOMATION_NOW + 2 * 86400000,
    gh,
  });
  expect(artifactCalls).toBe(0);
});

test("one inventory load caps diagnostic candidates at twenty while retaining complete native runs", async () => {
  const repository = "MentallyQuill/Tavernary",
    publisherActorId = 317929880;
  const receipts = Array.from({ length: 25 }, (_, index) => {
    const operation = operationFixture();
    operation.identity.subject = "issue:" + (42 + index);
    operation.key = operationKey(operation.identity);
    operation.workerRunId = 702 + index;
    return receiptFixture({ operation });
  });
  const rows = receipts.map((receipt, index) => ({
    id: 702 + index,
    run_attempt: 1,
    path: ".github/workflows/automation-worker.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "c".repeat(40),
    repository: { id: 42, full_name: repository },
    head_repository: { id: 42, full_name: repository },
    actor: { id: publisherActorId, type: "Bot" },
    display_title: "Automation " + receipt.operation.key,
    status: "completed",
    conclusion: "failure",
    created_at: "2026-10-08T11:58:00Z",
    updated_at: "2026-10-08T12:00:00Z",
  }));
  let artifacts = 0;
  const result = await loadGithubAutomationInventory({
    repository,
    publisherActorId,
    receipts,
    nowMs: AUTOMATION_NOW + 86400000,
    gh: async (args) => {
      const path = args.find((arg) => arg.startsWith("repos/"))!;
      if (path.endsWith("/git/ref/heads/main"))
        return JSON.stringify({ object: { sha: "d".repeat(40) } });
      if (path.endsWith("/artifacts")) {
        artifacts++;
        return JSON.stringify([{ total_count: 0, artifacts: [] }]);
      }
      if (path.endsWith("/actions/runs")) {
        const selected = args.some((arg) => arg.startsWith("status="))
          ? []
          : rows;
        return JSON.stringify([
          { total_count: selected.length, workflow_runs: selected },
        ]);
      }
      if (/\/issues\/[1-9]\d*$/u.test(path))
        return JSON.stringify({
          number: Number(path.split("/").at(-1)),
          state: "closed",
          labels: [],
        });
      return JSON.stringify([[]]);
    },
  });
  expect(result.runs).toHaveLength(25);
  expect(artifacts).toBe(20);
});
