import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { createPreparedReportContext } from "../../scripts/automation/report-publication-context.mjs";
import { acquirePreparedReportData } from "../../scripts/automation/report-preparation.mjs";
import { discoverReportOperations } from "../../scripts/automation/report-operations.mjs";
import { reportInventoryFixture } from "../helpers/automation-fixtures";
import {
  validateScanReport,
  computeReportDigest,
  validateReportIndex,
} from "../../scripts/security/tavernkeeper-reports.mjs";
import {
  buildDeterministicAssessment,
  deriveReportAdvisory,
  TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
} from "../../scripts/security/tavernkeeper-assessment-contract.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import scan from "../fixtures/tavernkeeper/scan-report.v5.valid.json";
import policy5 from "../fixtures/tavernkeeper/scan-report.v5.policy5.valid.json";
function dangerFixture() {
  const candidate = structuredClone(policy5.candidates[0]);
  const {
    assessment_source: _source,
    triage_reason_code: _reason,
    ...base
  } = policy5.assessments[0];
  const raw = {
    ...structuredClone(scan),
    scanner_policy_version: "4",
    contextual_review_policy_version: "3",
    prompt_version: "contextual-review-v6",
    assessment_schema_version: "contextual-assessment-v2",
    candidates: [candidate],
    assessments: [
      {
        ...base,
        disposition: "material_vulnerability",
        impact: "critical",
        exploitability: "readily_exploitable",
        risk_exposure: "demonstrated",
        recommended_risk: "high",
        technical_explanation:
          "The shipped path allows attacker input to cause critical harm.",
        layman_explanation: "An attacker can readily exploit the shipped flaw.",
        developer_action: "Remove the vulnerable path.",
      },
    ],
    review_coverage: { required: 1, completed: 1 },
    coverage: {
      ...scan.coverage,
      evidence_validation: { status: "completed", validated_candidates: 1 },
      javascript_analysis: policy5.coverage.javascript_analysis,
    },
    counts: {
      ...scan.counts,
      candidates: 1,
      assessments: 1,
      items: 1,
      disposition: { ...scan.counts.disposition, material_vulnerability: 1 },
      impact: { ...scan.counts.impact, critical: 1 },
      exploitability: { ...scan.counts.exploitability, readily_exploitable: 1 },
      confidence: { ...scan.counts.confidence, high: 1 },
      recommended_risk: { ...scan.counts.recommended_risk, high: 1 },
    },
  };
  const { report_id: _id, report_digest: _digest, ...body } = raw;
  const digest = computeReportDigest(body);
  const report = { ...body, report_id: digest, report_digest: digest };
  const entry = reportInventoryFixture().reportIndex.reports[0];
  return {
    report,
    entry: {
      ...entry,
      report_id: digest,
      report_digest: digest,
      scanner_policy_version: report.scanner_policy_version,
      contextual_review_policy_version: report.contextual_review_policy_version,
      prompt_version: report.prompt_version,
      assessment_schema_version: report.assessment_schema_version,
      counts: report.counts,
      coverage: {
        ...entry.coverage,
        evidence_validated: 1,
        review_required: 1,
        review_completed: 1,
        javascript_analysis_status: "complete",
      },
      report_url: entry.report_url
        .replace(entry.report_id, digest)
        .replace("/3/", "/4/"),
    },
  };
}
function fixture() {
  const input = reportInventoryFixture();
  const danger = dangerFixture();
  input.reportIndex = validateReportIndex(
    { ...input.reportIndex, reports: [danger.entry] },
    input.registry,
  );
  const operation = discoverReportOperations(input)[0];
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const entry = input.reportIndex.reports[0];
  const report = validateScanReport(danger.report, entry);
  const tracked = {
    ...entry,
    assessed_at: new Date(input.nowMs).toISOString(),
    synthesis_policy_version: TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    synthesis_model: `deterministic-policy-v${TAVERNKEEPER_SYNTHESIS_POLICY_VERSION}`,
    assessment_source: "deterministic_regrade" as const,
    danger_basis: deriveReportAdvisory(report).danger_basis,
    assessment: buildDeterministicAssessment(report),
  };
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41_982_982,
    nowMs: input.nowMs,
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: revision },
    receipts: [],
    operations: [operation],
    local: {
      revision,
      sources: input.registry,
      reportIndex: input.reportIndex,
      importState: input.importState,
      storedReports: {
        schema_version: 6,
        generated_at: "1970-01-01T00:00:00.000Z",
        reports: [],
        preferred_report_ids: [],
      },
    },
  };
  return {
    state,
    operation,
    readReport: async () => report,
    verifiedReports: new Map(),
    report,
    snapshot: {
      schema_version: 6,
      generated_at: input.reportIndex.generated_at,
      reports: [tracked],
      preferred_report_ids: [entry.report_id],
    },
  };
}
test("prepared report publication binds immutable report identity and its deterministic security evidence", async () => {
  const input = fixture();
  const context = await createPreparedReportContext(input);
  const path = "data/security/tavernkeeper-report-summaries.json";
  expect(context.source.identity).toBe("github:42");
  expect(context.validateContent(path, input.snapshot)).toBe(true);
  const lowered = structuredClone(input.snapshot);
  lowered.reports[0].assessment.risk_level = "low";
  lowered.reports[0].assessment.high_danger = 0;
  lowered.reports[0].danger_basis = "none";
  expect(context.validateContent(path, lowered)).toBe(false);
  const foreign = structuredClone(input.snapshot);
  foreign.reports[0].target_sha = "c".repeat(40);
  expect(context.validateContent(path, foreign)).toBe(false);
});
test("a delisted report source or changed current report blocks the writer before acquisition", async () => {
  const input = fixture();
  (input.state.local.sources as { status: string }[])[0].status = "withdrawn";
  await expect(createPreparedReportContext(input)).rejects.toThrow(
    /authority/u,
  );
  const stale = fixture();
  stale.state.local.reportIndex = {
    ...reportInventoryFixture().reportIndex,
    reports: [],
  };
  await expect(createPreparedReportContext(stale)).rejects.toThrow(
    /superseded/u,
  );
});
test("a prepared report cannot invent an unrelated quarantine", async () => {
  const input = fixture();
  const context = await createPreparedReportContext(input);
  const { quarantineTavernKeeperReport } =
    await import("../../scripts/security/tavernkeeper-import-state.mjs");
  const base = reportInventoryFixture();
  const invented = quarantineTavernKeeperReport(
    base.importState,
    {
      ...base.reportIndex.reports[0],
      report_digest: "c".repeat(64),
      report_id: "c".repeat(64),
    },
    TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    "provider-authentication-failed",
    new Date(input.state.nowMs).toISOString(),
  );
  expect(
    context.validateContent(
      "data/security/tavernkeeper-import-state.json",
      invented,
    ),
  ).toBe(false);
});

test("production report acquisition publishes deterministic security data without a model ticket or canonical writes", async () => {
  const input = fixture();
  const before = execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  });
  const outputs = await acquirePreparedReportData({
    ...input,
    options: {
      dnsLookup: async () => [{ address: "8.8.8.8", family: 4 }],
      requestImpl: async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith("/index.json")
              ? input.state.local.reportIndex
              : input.report,
          ),
          {
            headers: { "content-type": "application/json" },
          },
        ),
    },
  });
  const context = await createPreparedReportContext(input);
  const summary = JSON.parse(
    outputs["data/security/tavernkeeper-report-summaries.json"],
  );
  const importState = JSON.parse(
    outputs["data/security/tavernkeeper-import-state.json"],
  );
  expect(summary.reports[0].assessment_source).toBe("deterministic_fallback");
  expect(summary.reports[0].assessment.risk_level).toBe("high");
  expect(importState.quarantines[0].diagnostic).toBe("budget-exhausted");
  for (const [path, content] of Object.entries(outputs))
    expect(context.validateContent(path, JSON.parse(content))).toBe(true);
  expect(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }),
  ).toBe(before);
});
