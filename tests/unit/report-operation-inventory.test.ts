import { expect, test } from "vitest";
import { discoverReportOperations } from "../../scripts/automation/report-operations.mjs";
import { reportInventoryFixture } from "../helpers/automation-fixtures";
import { AUTOMATION_NOW, receiptFixture } from "../helpers/automation-fixtures";
import { quarantineTavernKeeperReport } from "../../scripts/security/tavernkeeper-import-state.mjs";
import { TAVERNKEEPER_SYNTHESIS_POLICY_VERSION } from "../../scripts/security/tavernkeeper-assessment-contract.mjs";
import { validateAutomationOperation } from "../../scripts/automation/operation.mjs";
import { planAutomationWorker } from "../../scripts/automation/worker.mjs";
import { loadGithubAutomationInventory } from "../../scripts/automation/github-inventory.mjs";

test("a lost report import event is reconstructed from the immutable report digest", () => {
  expect(discoverReportOperations(reportInventoryFixture())[0]).toMatchObject({
    identity: { kind: "report-import" },
    stage: "admitted",
  });
});

test("an exact canonical report and current synthesis policy do not import twice", () => {
  const input = reportInventoryFixture();
  const report = input.reportIndex.reports[0];
  input.importedReports = [
    {
      ...report,
      synthesis_policy_version: TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    },
  ];
  expect(discoverReportOperations(input)).toEqual([]);
  input.importedReports[0].synthesis_policy_version = "old";
  expect(discoverReportOperations(input)).toHaveLength(1);
});

test("provider quarantine does not delay missing deterministic assessment data", () => {
  const input = reportInventoryFixture();
  input.importState = quarantineTavernKeeperReport(
    input.importState,
    input.reportIndex.reports[0],
    TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    "provider-authentication-failed",
    new Date(AUTOMATION_NOW).toISOString(),
  );
  const operation = discoverReportOperations(input)[0];
  expect(operation.retry).toBeNull();
  expect(operation.nextEligibleAt).toBeNull();
  input.nowMs += 72 * 3_600_000;
  expect(discoverReportOperations(input)[0].nextEligibleAt).toBe(
    operation.nextEligibleAt,
  );
  expect(() => validateAutomationOperation(operation)).not.toThrow();
});

test("a new immutable report is not delayed by the old digest quarantine", () => {
  const input = reportInventoryFixture();
  input.importState = quarantineTavernKeeperReport(
    input.importState,
    input.reportIndex.reports[0],
    TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    "provider-authentication-failed",
    new Date(AUTOMATION_NOW).toISOString(),
  );
  const oldKey = discoverReportOperations(input)[0].key;
  const report = input.reportIndex.reports[0];
  const oldDigest = report.report_digest;
  report.report_digest = "f".repeat(64);
  report.report_id = report.report_digest;
  report.report_url = report.report_url.replace(
    oldDigest,
    report.report_digest,
  );
  const next = discoverReportOperations(input)[0];
  expect(next.key).not.toBe(oldKey);
  expect(next.retry).toBeNull();
});

test("foreign source identity and unsafe report URLs are rejected before dispatch", () => {
  const input = reportInventoryFixture();
  input.reportIndex.reports[0].repository = "attacker/repo";
  expect(() => discoverReportOperations(input)).toThrow();
  const unsafe = reportInventoryFixture();
  unsafe.reportIndex.reports[0].report_url =
    "https://attacker.example/report.json";
  expect(() => discoverReportOperations(unsafe)).toThrow();
});

test("receipts cannot claim report import without canonical digest and target evidence", () => {
  const input = reportInventoryFixture();
  const operation = discoverReportOperations(input)[0];
  input.receipts = [
    receiptFixture({
      operation: { ...operation, stage: "finalized", workerRunId: null },
      completedAt: new Date(AUTOMATION_NOW).toISOString(),
    }),
  ];
  expect(discoverReportOperations(input)[0].stage).toBe("admitted");
});

test("a trusted active report worker suppresses duplicate import but another digest remains independent", () => {
  const input = reportInventoryFixture();
  const operation = discoverReportOperations(input)[0];
  input.publisherActorId = 41_982_982;
  input.runs = [
    {
      id: 700,
      path: ".github/workflows/automation-worker.yml",
      event: "workflow_dispatch",
      display_title: `Automation ${operation.key}`,
      actor: { id: input.publisherActorId, type: "Bot" },
      head_branch: "main",
      status: "in_progress",
      conclusion: null,
    },
  ];
  expect(discoverReportOperations(input)[0].workerRunId).toBe(700);
  input.runs[0].actor!.id = 123;
  expect(discoverReportOperations(input)[0].workerRunId).toBeNull();
});

test("an explicit current owner narrative retry is reconstructed and routed through model reservations", () => {
  const input = reportInventoryFixture();
  input.repository = "MentallyQuill/Tavernary";
  const report = input.reportIndex.reports[0];
  input.importedReports = [
    {
      ...report,
      synthesis_policy_version: TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    },
  ];
  input.importState = quarantineTavernKeeperReport(
    input.importState,
    report,
    TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    "budget-exhausted",
    new Date(input.nowMs - 3_600_000).toISOString(),
  );
  const request = {
    id: 801,
    path: ".github/workflows/import-tavernkeeper-reports.yml",
    event: "workflow_dispatch",
    display_title: `Security: Retry narrative ${report.report_digest}`,
    actor: { id: 2625904, type: "User" },
    head_branch: "main",
    head_sha: "a".repeat(40),
    head_repository: { full_name: input.repository },
    created_at: new Date(input.nowMs - 60_000).toISOString(),
    updated_at: new Date(input.nowMs).toISOString(),
    run_attempt: 1,
    status: "completed",
    conclusion: "success",
  };
  input.runs = [request];
  const operation = discoverReportOperations(input)[0];
  expect(operation).toMatchObject({
    identity: {
      kind: "report-import",
      subject: `report:narrative:${report.report_digest}`,
    },
    stage: "admitted",
    retry: null,
  });
  expect(planAutomationWorker(operation)).toMatchObject({
    workflow: "automation-writer.yml",
    inputs: { mode: "prepare", operation_key: operation.key },
  });
  expect(() => validateAutomationOperation(operation)).not.toThrow();
  for (const change of [
    { actor: { id: 123, type: "User" } },
    { head_branch: "untrusted" },
    { head_repository: { full_name: "attacker/Tavernary" } },
    { run_attempt: 2 },
    { created_at: new Date(input.nowMs - 7_200_000).toISOString() },
    { created_at: new Date(input.nowMs + 3_600_000).toISOString() },
  ]) {
    input.runs = [{ ...request, ...change }];
    expect(discoverReportOperations(input)).toEqual([]);
  }
  input.runs = [request];
  input.importState.quarantines[0].last_failed_at = new Date(
    input.nowMs,
  ).toISOString();
  expect(discoverReportOperations(input)).toEqual([]);
  input.runs = [
    {
      ...request,
      id: 802,
      created_at: new Date(input.nowMs + 1000).toISOString(),
    },
  ];
  input.nowMs += 2000;
  expect(discoverReportOperations(input)[0].key).not.toBe(operation.key);
  input.importState.quarantines = [];
  expect(discoverReportOperations(input)).toEqual([]);
});

test("a durable report receipt recovers its authenticated owner intent outside the recent run window", async () => {
  const input = reportInventoryFixture();
  input.repository = "MentallyQuill/Tavernary";
  const report = input.reportIndex.reports[0];
  input.importedReports = [
    {
      ...report,
      synthesis_policy_version: TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    },
  ];
  input.importState = quarantineTavernKeeperReport(
    input.importState,
    report,
    TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    "budget-exhausted",
    new Date(input.nowMs - 1000).toISOString(),
  );
  const request = {
    id: 801,
    path: ".github/workflows/import-tavernkeeper-reports.yml",
    event: "workflow_dispatch",
    actor: { id: 2625904, type: "User" },
    head_branch: "main",
    head_sha: "a".repeat(40),
    head_repository: { full_name: input.repository },
    display_title: `Security: Retry narrative ${report.report_digest}`,
    created_at: new Date(input.nowMs).toISOString(),
    updated_at: new Date(input.nowMs).toISOString(),
    run_attempt: 1,
    status: "completed",
    conclusion: "success",
  };
  input.runs = [request];
  const operation = discoverReportOperations(input)[0];
  input.nowMs += 30 * 86_400_000;
  const receipt = receiptFixture({
    operation,
    updatedAt: new Date(input.nowMs).toISOString(),
    completedAt: null,
  });
  const calls: string[] = [];
  const inventory = await loadGithubAutomationInventory({
    repository: input.repository,
    receipts: [receipt],
    nowMs: input.nowMs,
    gh: async (args: string[]) => {
      const path = args.find((value) => value.startsWith("repos/"))!;
      calls.push(path);
      if (path.endsWith("/issues") || path.endsWith("/pulls")) return "[[]]";
      if (path.endsWith("/git/ref/heads/main"))
        return JSON.stringify({ object: { sha: "d".repeat(40) } });
      if (path.endsWith("/actions/runs/801")) return JSON.stringify(request);
      return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
    },
  });
  input.runs = inventory.runs;
  input.receipts = [receipt];
  expect(discoverReportOperations(input)[0].key).toBe(operation.key);
  expect(
    calls.filter((value) => value.endsWith("/actions/runs/801")),
  ).toHaveLength(1);
  input.runs[0].actor!.id = 123;
  expect(discoverReportOperations(input)).toEqual([]);
});
