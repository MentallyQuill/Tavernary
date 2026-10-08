import { expect, test } from "vitest";
import { discoverReportOperations } from "../../scripts/automation/report-operations.mjs";
import { reportInventoryFixture } from "../helpers/automation-fixtures";
import { AUTOMATION_NOW, receiptFixture } from "../helpers/automation-fixtures";
import { quarantineTavernKeeperReport } from "../../scripts/security/tavernkeeper-import-state.mjs";
import { TAVERNKEEPER_SYNTHESIS_POLICY_VERSION } from "../../scripts/security/tavernkeeper-assessment-contract.mjs";
import { validateAutomationOperation } from "../../scripts/automation/operation.mjs";

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

test("provider-authentication quarantine gets a stable daily probe instead of permanent exhaustion", () => {
  const input = reportInventoryFixture();
  input.importState = quarantineTavernKeeperReport(
    input.importState,
    input.reportIndex.reports[0],
    TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    "provider-authentication-failed",
    new Date(AUTOMATION_NOW).toISOString(),
  );
  const operation = discoverReportOperations(input)[0];
  expect(operation.retry?.failure.kind).toBe("configuration");
  expect(operation.nextEligibleAt).toBe(
    new Date(AUTOMATION_NOW + 86_400_000).toISOString(),
  );
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
