import { expect, test } from "vitest";
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import {
  projectInventoryFixture,
  receiptFixture,
} from "../helpers/automation-fixtures";
import { AUTOMATION_NOW } from "../helpers/automation-fixtures";
import { validateAutomationOperation } from "../../scripts/automation/operation.mjs";

test("lost generation event leaves eligible work discoverable", () => {
  const operations = discoverProjectOperations(
    projectInventoryFixture({
      admittedIssue: true,
      generatedPull: null,
      generationRun: null,
    }),
  );
  expect(operations.map((operation) => operation.stage)).toContain("admitted");
});

test("discovers missing admission and owner generation independently of events", () => {
  expect(
    discoverProjectOperations(
      projectInventoryFixture({ admittedIssue: false }),
    )[0],
  ).toMatchObject({ stage: "discovered" });
  expect(
    discoverProjectOperations(
      projectInventoryFixture({ producer: "project-owner-request" }),
    )[0],
  ).toMatchObject({ identity: { kind: "owner-request" }, stage: "admitted" });
});

test("discovers exact-head validation and a lost successful validation handoff", () => {
  expect(
    discoverProjectOperations(
      projectInventoryFixture({ generatedPull: {} }),
    )[0],
  ).toMatchObject({ stage: "generated", expectedSha: "c".repeat(40) });
  expect(
    discoverProjectOperations(
      projectInventoryFixture({ generatedPull: {}, validationRun: {} }),
    )[0],
  ).toMatchObject({ stage: "validated" });
  expect(
    discoverProjectOperations(
      projectInventoryFixture({
        generatedPull: {},
        validationRun: { head_sha: "e".repeat(40) },
      }),
    )[0],
  ).toMatchObject({ stage: "generated" });
});

test("recovers publication and finalization from a merged PR without a receipt", () => {
  expect(
    discoverProjectOperations(projectInventoryFixture({ merged: true }))[0],
  ).toMatchObject({ stage: "published", expectedSha: "d".repeat(40) });
  expect(
    discoverProjectOperations(
      projectInventoryFixture({ merged: true, confirmedDeployment: true }),
    )[0],
  ).toMatchObject({ stage: "deployment-confirmed" });
});

test.each(["head", "actor", "repository", "manual"] as const)(
  "excludes %s-diverged open transactions from automatic recovery",
  (change) => {
    const input = projectInventoryFixture({
      generatedPull: {},
      publicationMode: change === "manual" ? "manual" : "automatic",
    });
    const pull = input.pulls[0];
    if (change === "head") pull.head.sha = "e".repeat(40);
    if (change === "actor") pull.user.id = 123;
    if (change === "repository")
      pull.head.repo.full_name = "attacker/Tavernary";
    expect(discoverProjectOperations(input)).toEqual([]);
  },
);

test("edited normalized input gets a fresh operation and revalidation before publication", () => {
  const input = projectInventoryFixture({
    generatedPull: {},
    validationRun: {},
  });
  const previous = discoverProjectOperations(input)[0];
  input.issues[0].body = input.issues[0].body!.replace(
    '"additional_context":null',
    '"additional_context":"Changed input"',
  );
  const edited = discoverProjectOperations(input)[0];
  expect(edited.key).not.toBe(previous.key);
  expect(edited.stage).toBe("admitted");
});

test("lost owner authority, closed issues and intentional correction states remain protected", () => {
  for (const state of [
    "closed",
    "changed-author",
    "needs-information",
    "submission-declined",
  ]) {
    const input = projectInventoryFixture({
      generatedPull: {},
      producer: "project-owner-request",
    });
    if (state === "closed") input.issues[0].state = "closed";
    else if (state === "changed-author") input.issues[0].user!.id = 123;
    else input.issues[0].labels.push(state);
    expect(discoverProjectOperations(input)).toEqual([]);
  }
});

test("an active trusted generation suppresses dispatch and forged receipts cannot claim publication", () => {
  const input = projectInventoryFixture({ generationRun: {} });
  expect(discoverProjectOperations(input)[0]).toMatchObject({
    stage: "admitted",
    workerRunId: 700,
  });
  const operation = discoverProjectOperations(projectInventoryFixture())[0];
  input.runs = [];
  input.receipts = [
    receiptFixture({ operation: { ...operation, stage: "published" } }),
  ];
  expect(discoverProjectOperations(input)[0]).toMatchObject({
    stage: "admitted",
  });
});

test("processes inventories larger than one API page without truncating issues", () => {
  const input = projectInventoryFixture();
  input.issues = Array.from({ length: 205 }, (_, index) => ({
    ...input.issues[0],
    number: index + 1,
  }));
  const operations = discoverProjectOperations(input);
  expect(operations).toHaveLength(205);
  expect(new Set(operations.map((operation) => operation.key)).size).toBe(205);
});

test.each(["cancelled", "timed_out", "failure"])(
  "a current-input %s run without a PR retains a stable retry deadline",
  (conclusion) => {
    const input = projectInventoryFixture({
      generationRun: { status: "completed", conclusion },
    });
    const operation = discoverProjectOperations(projectInventoryFixture())[0];
    input.receipts = [
      receiptFixture({
        operation: { ...operation, workerRunId: 700 },
        updatedAt: new Date(AUTOMATION_NOW - 60_000).toISOString(),
      }),
    ];
    const failed = discoverProjectOperations(input)[0];
    expect(failed.workerRunId).toBeNull();
    expect(failed.retry?.failure.kind).toBe(
      conclusion === "failure" ? "unknown" : "transient",
    );
    expect(Date.parse(failed.nextEligibleAt!)).toBeGreaterThan(input.nowMs);
    input.receipts = [receiptFixture({ operation: failed })];
    input.nowMs += 72 * 3_600_000;
    const recovered = discoverProjectOperations(input)[0];
    expect(recovered.nextEligibleAt).toBe(failed.nextEligibleAt);
    expect(Date.parse(recovered.nextEligibleAt!)).toBeLessThan(input.nowMs);
    expect(() => validateAutomationOperation(recovered)).not.toThrow();
  },
);

test("changed inputs discard old configuration failures, counters and delays", () => {
  const input = projectInventoryFixture({
    generationRun: {
      status: "completed",
      conclusion: "failure",
      failure: { diagnosticCode: "provider-authentication-failed" },
    },
  });
  const operation = discoverProjectOperations(projectInventoryFixture())[0];
  input.receipts = [
    receiptFixture({ operation: { ...operation, workerRunId: 700 } }),
  ];
  expect(discoverProjectOperations(input)[0].retry?.failure.kind).toBe(
    "configuration",
  );
  input.issues[0].body = input.issues[0].body!.replace(
    '"additional_context":null',
    '"additional_context":"Changed input"',
  );
  expect(discoverProjectOperations(input)[0]).toMatchObject({
    nextEligibleAt: null,
    retry: null,
    workerRunId: null,
  });
});

test("a generation that succeeds without creating its PR gets a daily unknown probe after grace", () => {
  const input = projectInventoryFixture({
    generationRun: { status: "completed", conclusion: "success" },
  });
  const operation = discoverProjectOperations(projectInventoryFixture())[0];
  input.receipts = [
    receiptFixture({ operation: { ...operation, workerRunId: 700 } }),
  ];
  const waiting = discoverProjectOperations(input)[0];
  expect(waiting.nextEligibleAt).toBe(
    new Date(AUTOMATION_NOW + 14 * 60_000).toISOString(),
  );
  input.nowMs += 20 * 60_000;
  const probe = discoverProjectOperations(input)[0];
  expect(probe.retry?.failure.kind).toBe("unknown");
  expect(probe.retry?.immediateAttempts).toBeGreaterThanOrEqual(3);
  expect(Date.parse(probe.nextEligibleAt!)).toBe(
    AUTOMATION_NOW - 60_000 + 86_400_000,
  );
});

test("untrusted generation and publication runs cannot suppress trusted handoffs", () => {
  const input = projectInventoryFixture({
    generatedPull: {},
    validationRun: {},
  });
  input.runs.push({
    ...input.runs[0],
    id: 702,
    path: ".github/workflows/publish-project-transaction.yml",
    display_title: "Project publication for validation #701",
    status: "in_progress",
    conclusion: null,
    actor: { id: 123, type: "User" },
  });
  expect(discoverProjectOperations(input)[0].workerRunId).toBeNull();
  const intake = projectInventoryFixture({
    generationRun: { actor: { id: 123, type: "User" } },
  });
  expect(discoverProjectOperations(intake)[0].workerRunId).toBeNull();
});

test("active trusted regeneration of an unchanged head prevents duplicate publication", () => {
  const input = projectInventoryFixture({
    generatedPull: {},
    validationRun: {},
    generationRun: {},
  });
  expect(discoverProjectOperations(input)[0]).toMatchObject({
    workerRunId: 700,
  });
});

test("a merged transaction can finish deployment bookkeeping after its issue is closed", () => {
  const input = projectInventoryFixture({ merged: true });
  input.issues[0].state = "closed";
  expect(discoverProjectOperations(input)[0]).toMatchObject({
    stage: "published",
    expectedSha: "d".repeat(40),
  });
});

test("stale heads and malformed receipts cannot contribute retry evidence", () => {
  const input = projectInventoryFixture({
    generatedPull: {},
    validationRun: {},
  });
  const operation = discoverProjectOperations(input)[0];
  input.receipts = [
    receiptFixture({
      operation: {
        ...operation,
        key: "forged",
        stage: "generated",
        expectedSha: "e".repeat(40),
        retry: {
          failure: { kind: "permanent", reasonCode: "authorization-lost" },
          transientAttempts: 0,
          immediateAttempts: 1,
        },
      },
    }),
  ];
  expect(discoverProjectOperations(input)[0]).toMatchObject({
    stage: "validated",
    retry: null,
    nextEligibleAt: null,
  });
});

test("missing validation timestamps reuse current-head receipt timing instead of postponing forever", () => {
  const input = projectInventoryFixture({
    generatedPull: {},
    validationRun: {
      conclusion: "cancelled",
      created_at: undefined,
      updated_at: undefined,
    },
  });
  const failed = discoverProjectOperations(input)[0];
  expect(failed.nextEligibleAt).not.toBeNull();
  input.receipts = [receiptFixture({ operation: failed })];
  input.nowMs += 72 * 3_600_000;
  expect(discoverProjectOperations(input)[0].nextEligibleAt).toBe(
    failed.nextEligibleAt,
  );
});

test("an input edit still waits for a live generator before dispatching a replacement", () => {
  const input = projectInventoryFixture({
    generatedPull: {},
    generationRun: {},
  });
  input.issues[0].body = input.issues[0].body!.replace(
    '"additional_context":null',
    '"additional_context":"Changed input"',
  );
  expect(discoverProjectOperations(input)[0]).toMatchObject({
    stage: "admitted",
    workerRunId: 700,
  });
});
test("an operation-bound worker suppresses duplicate project dispatch before a legacy generation starts", () => {
  const input = projectInventoryFixture();
  const operation = discoverProjectOperations(input)[0];
  input.runs = [
    {
      id: 702,
      path: ".github/workflows/automation-worker.yml",
      event: "workflow_dispatch",
      display_title: `Automation ${operation.key}`,
      head_branch: "main",
      actor: { id: input.publisherActorId, type: "Bot" },
      status: "in_progress",
      conclusion: null,
    },
  ];
  expect(discoverProjectOperations(input)[0].workerRunId).toBe(702);
});
