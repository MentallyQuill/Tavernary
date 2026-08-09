import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  importTavernKeeperReports,
  reconcileTavernKeeperReports,
} from "../../scripts/security/import-tavernkeeper-reports.mjs";
import { TAVERNKEEPER_SYNTHESIS_POLICY_VERSION } from "../../scripts/security/tavernkeeper-assessment-contract.mjs";
import {
  ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION,
  TAVERNKEEPER_REPORT_INDEX_URL,
  computeReportDigest,
  fetchAndValidateTavernKeeperIndex,
  fetchAndValidateTavernKeeperReport,
  validateReportIndex,
  validateScanReport,
  validateStoredReportIndex,
} from "../../scripts/security/tavernkeeper-reports.mjs";
import { TavernKeeperSynthesisError } from "../../scripts/security/tavernkeeper-synthesis.mjs";

const indexFixturePath = resolve(
  "tests/fixtures/tavernkeeper/report-index.v5.valid.json",
);
const reportFixturePath = resolve(
  "tests/fixtures/tavernkeeper/scan-report.v5.valid.json",
);
const candidateId = "b".repeat(64);
const evidenceId = "c".repeat(64);
const registry = [
  {
    id: "github-42",
    type: "github",
    status: "active",
    repository_id: 42,
    repository: "owner/repo",
  },
];

async function fixtures() {
  return Promise.all(
    [indexFixturePath, reportFixturePath].map(async (path) =>
      JSON.parse(await readFile(path, "utf8")),
    ),
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function rebindReport(report: Record<string, any>): Record<string, any> {
  const body = { ...report };
  delete body.report_id;
  delete body.report_digest;
  const digest = computeReportDigest(body);
  return { ...body, report_id: digest, report_digest: digest };
}

function projectIndexReport(report: Record<string, any>) {
  const completed = report.coverage.tools.filter(
    ({ status }: { status: string }) => status === "completed",
  ).length;
  return {
    report_id: report.report_id,
    report_digest: report.report_digest,
    report_version: report.report_version,
    supersedes_report_id: report.supersedes_report_id,
    scanner_version: report.scanner_version,
    scanner_policy_version: report.scanner_policy_version,
    rule_catalog_version: report.rule_catalog_version,
    package_schema_version: report.package_schema_version,
    contextual_review_policy_version: report.contextual_review_policy_version,
    ecosystem_context_version: report.ecosystem_context_version,
    prompt_version: report.prompt_version,
    assessment_schema_version: report.assessment_schema_version,
    source_id: report.source_id,
    provider: report.provider,
    repository_id: report.repository_id,
    repository: report.repository,
    target_sha: report.target_sha,
    completed_at: report.completed_at,
    assessment_method: report.assessment_method,
    counts: clone(report.counts),
    coverage: {
      history_commits: report.history.commits,
      inventory_files: report.coverage.inventory.files,
      inventory_bytes: report.coverage.inventory.bytes,
      tools_completed: completed,
      tools_not_applicable: report.coverage.tools.length - completed,
      evidence_validated:
        report.coverage.evidence_validation.validated_candidates,
      metadata_only_candidates:
        report.coverage.evidence_validation.status ===
        "completed-with-limitations"
          ? report.coverage.evidence_validation.metadata_only_candidates
          : 0,
      review_required: report.review_coverage.required,
      review_completed: report.review_coverage.completed,
      javascript_analysis_status:
        report.coverage.javascript_analysis?.status ?? "legacy",
    },
    report_url:
      "https://mentallyquill.github.io/TavernKeeper/reports/github/" +
      `${report.repository_id}/${report.target_sha}/${report.scanner_policy_version}/` +
      `${report.report_id}/`,
    history_url:
      "https://mentallyquill.github.io/TavernKeeper/reports/github/" +
      `${report.repository_id}/history/`,
  };
}

function policy4Report(reportInput: Record<string, any>) {
  const report = clone(reportInput);
  report.scanner_policy_version = "4";
  report.coverage.javascript_analysis = {
    status: "complete",
    candidates: 1,
    candidate_bytes: 12,
    representations: {
      raw: 1,
      decoded: 0,
      normalized: 1,
      bundle_modules: 0,
    },
    stages: {
      raw_signatures: 1,
      raw_ast: 1,
      raw_opengrep: 1,
      derived_signatures: 1,
      derived_ast: 1,
      derived_opengrep: 1,
    },
    unresolved: [],
  };
  return rebindReport(report);
}

function addExpectedCandidate(reportInput: Record<string, any>) {
  const report = clone(reportInput);
  report.candidates = [
    {
      candidate_id: candidateId,
      evidence_id: evidenceId,
      origin: "tavernkeeper",
      scanner_version: "2",
      rule_id: "dynamic-code-execution",
      category: "code-execution",
      scanner_severity: "high",
      scanner_confidence: "medium",
      path: "src/index.js",
      line_start: 10,
      line_end: 12,
      evidence_sha: report.target_sha,
      file_role: "production",
      title: "Dynamic code execution",
      explanation: "The scanner found a dynamic execution primitive.",
      remediation: "Avoid dynamic execution when practical.",
    },
  ];
  report.assessments = [
    {
      candidate_id: candidateId,
      evidence_ids: [evidenceId],
      disposition: "expected_behavior",
      impact: "low",
      exploitability: "unlikely",
      confidence: "high",
      recommended_risk: "low",
      technical_explanation:
        "The call evaluates a trusted, bundled expression used by the extension.",
      layman_explanation:
        "This code supports the extension's documented behavior and is not user controlled.",
      developer_action: "Keep the input boundary documented and tested.",
      locations: [{ path: "src/index.js", line_start: 10, line_end: 12 }],
    },
  ];
  report.counts = {
    candidates: 1,
    assessments: 1,
    observations: 0,
    items: 1,
    disposition: {
      expected_behavior: 1,
      minor_weakness: 0,
      material_vulnerability: 0,
      credible_malicious_behavior: 0,
    },
    impact: { none: 0, low: 1, medium: 0, high: 0, critical: 0 },
    exploitability: {
      unlikely: 1,
      plausible: 0,
      readily_exploitable: 0,
    },
    confidence: { low: 0, medium: 0, high: 1 },
    recommended_risk: { low: 1, material: 0, high: 0 },
  };
  report.review_coverage = { required: 1, completed: 1 };
  report.coverage.evidence_validation.validated_candidates = 1;
  return rebindReport(report);
}

function addImmediateDangerCandidate(reportInput: Record<string, any>) {
  const report = addExpectedCandidate(reportInput);
  report.assessments[0] = {
    ...report.assessments[0],
    disposition: "material_vulnerability",
    impact: "critical",
    exploitability: "readily_exploitable",
    confidence: "high",
    recommended_risk: "high",
    technical_explanation:
      "The shipped vulnerable path is reachable by untrusted input and can cause critical harm.",
    layman_explanation:
      "An attacker can readily exploit this flaw when the extension is used.",
    developer_action: "Remove the vulnerable path before further use.",
  };
  report.counts.disposition = {
    expected_behavior: 0,
    minor_weakness: 0,
    material_vulnerability: 1,
    credible_malicious_behavior: 0,
  };
  report.counts.impact = {
    none: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 1,
  };
  report.counts.exploitability = {
    unlikely: 0,
    plausible: 0,
    readily_exploitable: 1,
  };
  report.counts.recommended_risk = { low: 0, material: 0, high: 1 };
  return rebindReport(report);
}

function publicDnsLookup() {
  return Promise.resolve([{ address: "8.8.8.8", family: 4 }]);
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

function assessedEntry(
  indexEntry: Record<string, any>,
  overrides: Record<string, any> = {},
): Record<string, any> {
  return {
    ...indexEntry,
    assessed_at: "2026-08-02T12:06:00.000Z",
    synthesis_policy_version: TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
    synthesis_model: "gpt-5.6-luna",
    assessment: {
      risk_level: "low",
      headline: "Low concern",
      summary: "No contextual concerns were identified in this scan.",
      minor_cautions: 0,
      material_concerns: 0,
      high_danger: 0,
      malicious_evidence: "No evidence of malicious behavior was identified.",
      cited_finding_ids: [],
      interaction_chains: [],
    },
    ...overrides,
  };
}

function synthesisFor(indexEntry: Record<string, any>) {
  const assessed = assessedEntry(indexEntry);
  return {
    report_id: assessed.report_id,
    target_sha: assessed.target_sha,
    assessed_at: assessed.assessed_at,
    synthesis_policy_version: assessed.synthesis_policy_version,
    synthesis_model: assessed.synthesis_model,
    assessment: assessed.assessment,
  };
}

function secondReportFrom(reportInput: Record<string, any>) {
  const report = clone(reportInput);
  report.source_id = "github-43";
  report.repository_id = 43;
  report.repository = "owner/repo-two";
  report.canonical_url = "https://github.com/owner/repo-two";
  report.target_sha = "d".repeat(40);
  report.completed_at = "2026-08-02T12:01:00.000Z";
  report.report_version = 1;
  report.supersedes_report_id = null;
  return rebindReport(report);
}

describe("TavernKeeper V5 report import", () => {
  test("uses scanner policy 4 as active catalog evidence", () => {
    expect(ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION).toBe("4");
  });

  test("accepts a policy-4 index and matching JavaScript coverage", async () => {
    const [fixtureIndex, baseReport] = await fixtures();
    const report = policy4Report(baseReport);
    const entry = projectIndexReport(report);
    const index = { ...fixtureIndex, reports: [entry] };

    const validatedIndex = validateReportIndex(index, registry);
    expect(validateScanReport(report, validatedIndex.reports[0])).toEqual(
      report,
    );
  });

  test("accepts policy-4 candidates from completed JavaScript analysis", async () => {
    const [fixtureIndex, baseReport] = await fixtures();
    const report = addExpectedCandidate(policy4Report(baseReport));
    report.candidates[0].origin = "javascript-analysis";
    report.candidates[0].scanner_version =
      "webcrack-2.16.0_js-x-ray-16.0.0_signatures-1_literals-1";
    report.candidates[0].rule_id = "javascript.xray.unsafe-command";
    report.coverage.tools.push({
      name: "javascript-analysis",
      version: report.candidates[0].scanner_version,
      status: "completed",
    });
    const rebound = rebindReport(report);
    const entry = projectIndexReport(rebound);
    const validatedIndex = validateReportIndex(
      { ...fixtureIndex, reports: [entry] },
      registry,
    );

    expect(validateScanReport(rebound, validatedIndex.reports[0])).toEqual(
      rebound,
    );
  });

  test("normalizes fetched policy-3 indexes that predate JavaScript coverage", async () => {
    const [index] = await fixtures();
    delete index.reports[0].coverage.javascript_analysis_status;
    delete index.reports[0].coverage.metadata_only_candidates;

    const fetched = await fetchAndValidateTavernKeeperIndex({
      dnsLookup: publicDnsLookup,
      requestImpl: async () => jsonResponse(index),
    });

    expect(validateReportIndex(fetched, registry)).toMatchObject({
      reports: [
        expect.objectContaining({
          coverage: expect.objectContaining({
            javascript_analysis_status: "legacy",
            metadata_only_candidates: 0,
          }),
        }),
      ],
    });
  });

  test("rejects policy-4 index entries without policy-4 JavaScript coverage", async () => {
    const [fixtureIndex, baseReport] = await fixtures();
    const report = policy4Report(baseReport);
    const entry = projectIndexReport(report);
    entry.coverage.javascript_analysis_status = "legacy";

    expect(() =>
      validateReportIndex({ ...fixtureIndex, reports: [entry] }, registry),
    ).toThrow(/JavaScript coverage/u);
  });

  test("rejects policy-4 reports that omit detailed JavaScript coverage", async () => {
    const [fixtureIndex, baseReport] = await fixtures();
    const covered = policy4Report(baseReport);
    const entry = projectIndexReport(covered);
    const report = clone(covered);
    delete report.coverage.javascript_analysis;
    const rebound = rebindReport(report);
    entry.report_id = rebound.report_id;
    entry.report_digest = rebound.report_digest;
    entry.report_url = entry.report_url.replace(
      covered.report_id,
      rebound.report_id,
    );

    const validatedIndex = validateReportIndex(
      { ...fixtureIndex, reports: [entry] },
      registry,
    );
    expect(() =>
      validateScanReport(rebound, validatedIndex.reports[0]),
    ).toThrow(/JavaScript .*coverage/u);
  });

  test("rejects complete JavaScript coverage with an unrecovered stage", async () => {
    const [fixtureIndex, baseReport] = await fixtures();
    const report = policy4Report(baseReport);
    report.coverage.javascript_analysis.unresolved = [
      {
        path: "dist/index.min.js",
        stage: "derived-ast",
        reason: "parse",
        recovered: false,
      },
    ];
    const rebound = rebindReport(report);
    const entry = projectIndexReport(rebound);
    const validatedIndex = validateReportIndex(
      { ...fixtureIndex, reports: [entry] },
      registry,
    );

    expect(() =>
      validateScanReport(rebound, validatedIndex.reports[0]),
    ).toThrow(/unrecovered JavaScript/u);
  });

  test("accepts bounded metadata-only evidence with its fixed limitation", async () => {
    const [fixtureIndex, baseReport] = await fixtures();
    const report = addExpectedCandidate(policy4Report(baseReport));
    report.coverage.evidence_validation = {
      status: "completed-with-limitations",
      validated_candidates: 1,
      metadata_only_candidates: 1,
    };
    report.limitations.push(
      "One or more scanner candidates refer to non-text artifacts. Their size, digest, and scanner metadata were verified, but raw contents were not provided to the contextual model.",
    );
    const rebound = rebindReport(report);
    const entry = projectIndexReport(rebound);
    const validatedIndex = validateReportIndex(
      { ...fixtureIndex, reports: [entry] },
      registry,
    );

    expect(validateScanReport(rebound, validatedIndex.reports[0])).toEqual(
      rebound,
    );
  });

  test("rejects metadata-only evidence without its fixed limitation", async () => {
    const [fixtureIndex, baseReport] = await fixtures();
    const report = addExpectedCandidate(policy4Report(baseReport));
    report.coverage.evidence_validation = {
      status: "completed-with-limitations",
      validated_candidates: 1,
      metadata_only_candidates: 1,
    };
    const rebound = rebindReport(report);
    const entry = projectIndexReport(rebound);
    const validatedIndex = validateReportIndex(
      { ...fixtureIndex, reports: [entry] },
      registry,
    );

    expect(() =>
      validateScanReport(rebound, validatedIndex.reports[0]),
    ).toThrow(/metadata-only evidence limitation/iu);
  });

  test("accepts disclosed conservative model fallback coverage", async () => {
    const [fixtureIndex, baseReport] = await fixtures();
    const report = addExpectedCandidate(policy4Report(baseReport));
    report.review_coverage = {
      required: 1,
      completed: 1,
      model_completed: 0,
      deterministic_fallback: 1,
    };
    report.assessments[0] = {
      ...report.assessments[0],
      disposition: "material_vulnerability",
      impact: "medium",
      exploitability: "plausible",
      confidence: "low",
      recommended_risk: "material",
      technical_explanation:
        "Contextual model assessment was unavailable within the bounded review window.",
      layman_explanation:
        "Automated contextual review could not resolve this scanner warning.",
      developer_action: "Manually inspect the cited evidence before release.",
    };
    report.counts = {
      ...report.counts,
      disposition: {
        expected_behavior: 0,
        minor_weakness: 0,
        material_vulnerability: 1,
        credible_malicious_behavior: 0,
      },
      impact: { none: 0, low: 0, medium: 1, high: 0, critical: 0 },
      exploitability: {
        unlikely: 0,
        plausible: 1,
        readily_exploitable: 0,
      },
      confidence: { low: 1, medium: 0, high: 0 },
      recommended_risk: { low: 0, material: 1, high: 0 },
    };
    report.limitations.push(
      "One or more scanner candidates did not receive contextual model assessment within the bounded review window. They remain conservatively classified as material concerns and require manual inspection.",
    );
    const rebound = rebindReport(report);
    const entry = projectIndexReport(rebound);
    const validatedIndex = validateReportIndex(
      { ...fixtureIndex, reports: [entry] },
      registry,
    );

    expect(() =>
      validateScanReport(rebound, validatedIndex.reports[0]),
    ).not.toThrow();
  });

  test("rejects fallback coverage that is missing or presented as clean", async () => {
    const [fixtureIndex, baseReport] = await fixtures();
    const report = addExpectedCandidate(policy4Report(baseReport));
    report.review_coverage = {
      required: 1,
      completed: 1,
      model_completed: 0,
      deterministic_fallback: 1,
    };
    const rebound = rebindReport(report);
    const entry = projectIndexReport(rebound);
    const validatedIndex = validateReportIndex(
      { ...fixtureIndex, reports: [entry] },
      registry,
    );

    expect(() =>
      validateScanReport(rebound, validatedIndex.reports[0]),
    ).toThrow(/fallback/iu);
  });

  test("rejects incomplete JavaScript coverage when every stage recovered", async () => {
    const [fixtureIndex, baseReport] = await fixtures();
    const report = policy4Report(baseReport);
    report.coverage.javascript_analysis.status = "incomplete";
    report.coverage.javascript_analysis.unresolved = [
      {
        path: "dist/index.min.js",
        stage: "derived-ast",
        reason: "parse",
        recovered: true,
      },
    ];
    report.limitations.push(
      "JavaScript analysis was incomplete, so this first-filter scan supports no clean conclusion about unobserved behavior.",
    );
    const rebound = rebindReport(report);
    const entry = projectIndexReport(rebound);
    const validatedIndex = validateReportIndex(
      { ...fixtureIndex, reports: [entry] },
      registry,
    );

    expect(() =>
      validateScanReport(rebound, validatedIndex.reports[0]),
    ).toThrow(/unrecovered JavaScript/u);
  });

  test("rejects an inactive scanner policy from the preferred report index", async () => {
    const [index] = await fixtures();
    index.reports[0].scanner_policy_version = "2";
    index.reports[0].report_url = index.reports[0].report_url.replace(
      "/3/",
      "/2/",
    );

    expect(() => validateReportIndex(index, registry)).toThrow(/policy/u);
  });

  test("accepts a complete V5 preferred index and matching immutable report", async () => {
    const [index, report] = await fixtures();
    const validatedIndex = validateReportIndex(index, registry);

    expect(validateScanReport(report, validatedIndex.reports[0])).toEqual(
      report,
    );
  });

  test("publishes a deterministic immediate-danger fallback when synthesis is invalid", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v6-red-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    const importStatePath = resolve(
      root,
      "data/security/tavernkeeper-import-state.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    await writeFile(
      outputPath,
      '{"schema_version":5,"generated_at":"1970-01-01T00:00:00.000Z","preferred_report_ids":[],"reports":[]}\n',
    );
    const [fixtureIndex, fixtureReport] = await fixtures();
    const report = addImmediateDangerCandidate(fixtureReport);
    const entry = projectIndexReport(report);
    const index = { ...fixtureIndex, reports: [entry] };

    const outcome = await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) =>
        jsonResponse(url === TAVERNKEEPER_REPORT_INDEX_URL ? index : report),
      synthesizeReport: async () => {
        throw new TavernKeeperSynthesisError(
          "invalid-output",
          "unsupported_escalation",
        );
      },
      now: () => new Date("2026-08-04T20:00:00.000Z"),
    });

    expect(outcome.snapshot).toMatchObject({
      schema_version: 6,
      preferred_report_ids: [entry.report_id],
      reports: [
        {
          report_id: entry.report_id,
          danger_basis: "critical_exploitable_vulnerability",
          assessment_source: "deterministic_fallback",
          synthesis_model: "deterministic-policy-v4",
          assessment: {
            risk_level: "high",
            headline: "Immediate danger identified",
          },
        },
      ],
    });
    expect(outcome).toMatchObject({ imported: 1, quarantined: 1 });
    expect(outcome.import_state.quarantines).toEqual([
      expect.objectContaining({
        report_id: entry.report_id,
        diagnostic: "unsupported_escalation",
      }),
    ]);
  });

  test("keeps prior summaries preferred while policy-4 enrichment advances in batches", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v6-rollout-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    const importStatePath = resolve(
      root,
      "data/security/tavernkeeper-import-state.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    const [index, report] = await fixtures();
    const secondReport = secondReportFrom(report);
    const secondEntry = projectIndexReport(secondReport);
    index.reports.push(secondEntry);
    const priorReports = index.reports.map((entry: Record<string, any>) => ({
      ...assessedEntry(entry, { synthesis_policy_version: "3" }),
      danger_basis: "none",
      assessment_source: "model",
    }));
    await writeFile(
      outputPath,
      `${JSON.stringify({
        schema_version: 6,
        generated_at: index.generated_at,
        preferred_report_ids: priorReports.map(
          (entry: Record<string, any>) => entry.report_id,
        ),
        reports: priorReports,
      })}\n`,
    );
    const expandedRegistry = [
      ...registry,
      {
        id: "github-43",
        type: "github",
        status: "active",
        repository_id: 43,
        repository: "owner/repo-two",
      },
    ];

    const outcome = await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry: expandedRegistry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) =>
        jsonResponse(
          url === TAVERNKEEPER_REPORT_INDEX_URL
            ? index
            : url.includes(secondReport.report_id)
              ? secondReport
              : report,
        ),
      synthesizeReport: async (currentReport: Record<string, any>) =>
        synthesisFor(
          currentReport.repository_id === 43 ? secondEntry : index.reports[0],
        ),
      batchSize: 1,
      now: () => new Date("2026-08-04T20:05:00.000Z"),
    });

    expect(outcome.imported).toBe(1);
    expect(outcome.remaining).toBe(1);
    expect(outcome.snapshot.preferred_report_ids).toEqual(
      index.reports.map((entry: Record<string, any>) => entry.report_id),
    );
  });

  test.each([1, 2, 3, 4])(
    "rejects report-index schema V%s",
    async (version) => {
      const [index] = await fixtures();
      index.schema_version = version;

      expect(() => validateReportIndex(index, registry)).toThrow(
        /unsupported schema version/u,
      );
    },
  );

  test("rejects duplicate preferred repository identities", async () => {
    const [index] = await fixtures();
    index.reports.push(clone(index.reports[0]));

    expect(() => validateReportIndex(index, registry)).toThrow(/duplicate/u);
  });

  test("rejects inactive Tavernary sources", async () => {
    const [index] = await fixtures();
    const inactive = [{ ...registry[0], status: "inactive" }];

    expect(() => validateReportIndex(index, inactive)).toThrow(/active/u);
  });

  test("rejects a non-boolean delisted-source pruning option", async () => {
    const [index] = await fixtures();
    const delistedRegistry = registry.map((source) => ({
      ...source,
      status: "delisted",
    }));

    expect(() =>
      validateReportIndex(index, delistedRegistry, {
        pruneDelisted: "false",
      } as never),
    ).toThrow(/option/u);
  });

  test("prunes only exact known delisted identities from a mixed index", async () => {
    const [index, report] = await fixtures();
    const delistedReport = secondReportFrom(report);
    const delistedEntry = projectIndexReport(delistedReport);
    index.reports.push(delistedEntry);
    const mixedRegistry = [
      ...registry,
      {
        id: "github-43",
        type: "github",
        status: "delisted",
        repository_id: 43,
        repository: "owner/repo-two",
      },
    ];

    expect(
      validateReportIndex(index, mixedRegistry, { pruneDelisted: true })
        .reports,
    ).toEqual([index.reports[0]]);

    const unknownIndex = clone(index);
    unknownIndex.reports[1].repository_id = 44;
    unknownIndex.reports[1].source_id = "github-44";
    unknownIndex.reports[1].report_url = unknownIndex.reports[1].report_url
      .replace("/github/43/", "/github/44/")
      .replace(delistedEntry.report_id, unknownIndex.reports[1].report_id);
    unknownIndex.reports[1].history_url =
      unknownIndex.reports[1].history_url.replace("/github/43/", "/github/44/");
    expect(() =>
      validateReportIndex(unknownIndex, mixedRegistry, {
        pruneDelisted: true,
      }),
    ).toThrow(/active Tavernary source/u);

    const mismatchedIndex = clone(index);
    mismatchedIndex.reports[1].repository = "other/repo";
    expect(() =>
      validateReportIndex(mismatchedIndex, mixedRegistry, {
        pruneDelisted: true,
      }),
    ).toThrow(/identity/u);
  });

  test("rejects a repository identity that differs from Tavernary", async () => {
    const [index] = await fixtures();
    index.reports[0].repository = "other/repo";

    expect(() => validateReportIndex(index, registry)).toThrow(/identity/u);
  });

  test("rejects noncanonical immutable report paths", async () => {
    const [index] = await fixtures();
    index.reports[0].report_url =
      "https://mentallyquill.github.io/TavernKeeper/reports/github/42/latest/";

    expect(() => validateReportIndex(index, registry)).toThrow(/URL/u);
  });

  test("rejects a report whose body digest does not match its identity", async () => {
    const [index, report] = await fixtures();
    report.limitations = ["A changed body with a stale digest."];

    expect(() => validateScanReport(report, index.reports[0])).toThrow(
      /digest/u,
    );
  });

  test("rejects incomplete contextual coverage", async () => {
    const [index, baseReport] = await fixtures();
    const report = addExpectedCandidate(baseReport);
    report.review_coverage.completed = 0;

    expect(() =>
      validateScanReport(rebindReport(report), projectIndexReport(report)),
    ).toThrow(/coverage/u);
  });

  test("rejects assessments for unknown candidates", async () => {
    const [, baseReport] = await fixtures();
    const report = addExpectedCandidate(baseReport);
    report.assessments[0].candidate_id = "d".repeat(64);

    expect(() => {
      const rebound = rebindReport(report);
      validateScanReport(rebound, projectIndexReport(rebound));
    }).toThrow(/candidate/u);
  });

  test("rejects contextual counts that do not match report items", async () => {
    const [, baseReport] = await fixtures();
    const report = addExpectedCandidate(baseReport);
    report.counts.disposition.expected_behavior = 0;

    expect(() => {
      const rebound = rebindReport(report);
      validateScanReport(rebound, projectIndexReport(rebound));
    }).toThrow(/count/u);
  });

  test("fetches the preferred index and immutable report through hardened same-origin URLs", async () => {
    const [index, report] = await fixtures();
    const requests: string[] = [];
    const options = {
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) => {
        requests.push(url);
        return jsonResponse(
          url === TAVERNKEEPER_REPORT_INDEX_URL ? index : report,
        );
      },
    };

    const fetchedIndex = await fetchAndValidateTavernKeeperIndex(options);
    await expect(
      fetchAndValidateTavernKeeperReport(fetchedIndex.reports[0], options),
    ).resolves.toEqual(report);
    expect(requests).toEqual([
      TAVERNKEEPER_REPORT_INDEX_URL,
      index.reports[0].report_url + "report.json",
    ]);
  });

  test("rejects cross-origin report redirects", async () => {
    const [index] = await fixtures();
    await expect(
      fetchAndValidateTavernKeeperReport(index.reports[0], {
        dnsLookup: publicDnsLookup,
        requestImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://example.test/report.json" },
          }),
      }),
    ).rejects.toThrow(/origin/u);
  });

  test("validates the bounded V5 tracked projection and its preferred IDs", async () => {
    const [index] = await fixtures();
    const entry = {
      ...index.reports[0],
      assessed_at: "2026-08-02T12:06:00.000Z",
      synthesis_policy_version: "1",
      synthesis_model: "gpt-5.6-luna",
      assessment: {
        risk_level: "low",
        headline: "Low concern",
        summary: "No contextual concerns were identified in this scan.",
        minor_cautions: 0,
        material_concerns: 0,
        high_danger: 0,
        malicious_evidence: "No evidence of malicious behavior was identified.",
        cited_finding_ids: [],
        interaction_chains: [],
      },
    };
    const stored = {
      schema_version: 5,
      generated_at: index.generated_at,
      preferred_report_ids: [entry.report_id],
      reports: [entry],
    };

    expect(validateStoredReportIndex(stored, registry)).toMatchObject({
      schema_version: 6,
      reports: [
        expect.objectContaining({
          danger_basis: "none",
          assessment_source: "model",
        }),
      ],
    });
    expect(() =>
      validateStoredReportIndex(
        { ...stored, preferred_report_ids: ["f".repeat(64)] },
        registry,
      ),
    ).toThrow(/preferred/u);
  });

  test("migrates legacy policy-3 stored summaries in memory", async () => {
    const [index] = await fixtures();
    const entry = assessedEntry(index.reports[0]);
    delete entry.coverage.javascript_analysis_status;
    entry.danger_basis = "none";
    entry.assessment_source = "model";

    expect(
      validateStoredReportIndex(
        {
          schema_version: 6,
          generated_at: index.generated_at,
          preferred_report_ids: [],
          reports: [entry],
        },
        registry,
      ),
    ).toMatchObject({
      reports: [
        expect.objectContaining({
          coverage: expect.objectContaining({
            javascript_analysis_status: "legacy",
          }),
        }),
      ],
    });
  });

  test("accepts a stored low-risk assessment with incomplete JavaScript coverage", async () => {
    const [index, baseReport] = await fixtures();
    const report = policy4Report(baseReport);
    report.coverage.javascript_analysis.status = "incomplete";
    report.coverage.javascript_analysis.unresolved = [
      {
        path: "dist/index.min.js",
        stage: "derived-ast",
        reason: "parse",
        recovered: false,
      },
    ];
    report.limitations.push(
      "JavaScript analysis was incomplete, so this first-filter scan supports no clean conclusion about unobserved behavior.",
    );
    const entry = assessedEntry(projectIndexReport(rebindReport(report)), {
      danger_basis: "none",
      assessment_source: "model",
    });

    expect(
      validateStoredReportIndex(
        {
          schema_version: 6,
          generated_at: index.generated_at,
          preferred_report_ids: [entry.report_id],
          reports: [entry],
        },
        registry,
      ),
    ).toMatchObject({
      reports: [
        expect.objectContaining({
          assessment: expect.objectContaining({ risk_level: "low" }),
          coverage: expect.objectContaining({
            javascript_analysis_status: "incomplete",
          }),
        }),
      ],
    });
  });

  test("accepts a stored low-risk assessment with metadata-only evidence", async () => {
    const [index, baseReport] = await fixtures();
    const report = addExpectedCandidate(policy4Report(baseReport));
    report.coverage.evidence_validation = {
      status: "completed-with-limitations",
      validated_candidates: 1,
      metadata_only_candidates: 1,
    };
    report.limitations.push(
      "One or more scanner candidates refer to non-text artifacts. Their size, digest, and scanner metadata were verified, but raw contents were not provided to the contextual model.",
    );
    const entry = assessedEntry(projectIndexReport(rebindReport(report)), {
      danger_basis: "none",
      assessment_source: "model",
    });

    expect(
      validateStoredReportIndex(
        {
          schema_version: 6,
          generated_at: index.generated_at,
          preferred_report_ids: [entry.report_id],
          reports: [entry],
        },
        registry,
      ),
    ).toMatchObject({
      reports: [
        expect.objectContaining({
          assessment: expect.objectContaining({ risk_level: "low" }),
          coverage: expect.objectContaining({ metadata_only_candidates: 1 }),
        }),
      ],
    });
  });

  test("accepts deterministic regrade as an assessment source", async () => {
    const [index] = await fixtures();
    const entry = assessedEntry(index.reports[0], {
      danger_basis: "none",
      assessment_source: "deterministic_regrade",
    });

    expect(
      validateStoredReportIndex(
        {
          schema_version: 6,
          generated_at: index.generated_at,
          preferred_report_ids: [entry.report_id],
          reports: [entry],
        },
        registry,
      ),
    ).toMatchObject({
      reports: [
        expect.objectContaining({
          assessment_source: "deterministic_regrade",
        }),
      ],
    });
  });

  test("keeps stored history valid during a source delist transition", async () => {
    const [index] = await fixtures();
    const entry = assessedEntry(index.reports[0]);
    const stored = {
      schema_version: 5,
      generated_at: index.generated_at,
      preferred_report_ids: [entry.report_id],
      reports: [entry],
    };
    const delistedRegistry = registry.map((source) => ({
      ...source,
      status: "delisted",
    }));

    expect(validateStoredReportIndex(stored, delistedRegistry)).toMatchObject({
      schema_version: 6,
      reports: [expect.objectContaining({ source_id: "github-42" })],
    });
    expect(() => validateReportIndex(index, delistedRegistry)).toThrow(
      /active Tavernary source/u,
    );
  });

  test("prunes a known delisted source before reconciling the preferred index", async () => {
    const root = await mkdtemp(
      resolve(tmpdir(), "tavernkeeper-v6-delisted-index-"),
    );
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    const importStatePath = resolve(
      root,
      "data/security/tavernkeeper-import-state.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    const [index] = await fixtures();
    const entry = assessedEntry(index.reports[0], {
      danger_basis: "none",
      assessment_source: "model",
    });
    await writeFile(
      outputPath,
      `${JSON.stringify({
        schema_version: 6,
        generated_at: index.generated_at,
        preferred_report_ids: [entry.report_id],
        reports: [entry],
      })}\n`,
    );
    const delistedRegistry = registry.map((source) => ({
      ...source,
      status: "delisted",
    }));

    const outcome = await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry: delistedRegistry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) => {
        if (url !== TAVERNKEEPER_REPORT_INDEX_URL) {
          throw new Error("delisted reports must not be fetched");
        }
        return jsonResponse(index);
      },
      synthesizeReport: async () => {
        throw new Error("delisted reports must not be synthesized");
      },
    });

    expect(outcome).toMatchObject({ imported: 0, retained: 0, remaining: 0 });
    expect(outcome.snapshot).toMatchObject({
      preferred_report_ids: [],
      reports: [],
    });
  });

  test("retains an inactive-policy assessment only as non-preferred history", async () => {
    const [index] = await fixtures();
    const historical = {
      ...index.reports[0],
      scanner_policy_version: "2",
      report_url: index.reports[0].report_url.replace("/3/", "/2/"),
      assessed_at: "2026-08-02T12:06:00.000Z",
      synthesis_policy_version: "1",
      synthesis_model: "gpt-5.6-luna",
      assessment: {
        risk_level: "low",
        headline: "Historical low concern",
        summary: "This assessment was produced under an inactive policy.",
        minor_cautions: 0,
        material_concerns: 0,
        high_danger: 0,
        malicious_evidence: "No evidence of malicious behavior was identified.",
        cited_finding_ids: [],
        interaction_chains: [],
      },
    };
    const snapshot = {
      schema_version: 5,
      generated_at: index.generated_at,
      preferred_report_ids: [],
      reports: [historical],
    };

    expect(validateStoredReportIndex(snapshot, registry)).toMatchObject({
      schema_version: 6,
      reports: [
        expect.objectContaining({
          danger_basis: "none",
          assessment_source: "model",
        }),
      ],
    });
    expect(() =>
      validateStoredReportIndex(
        { ...snapshot, preferred_report_ids: [historical.report_id] },
        registry,
      ),
    ).toThrow(/policy/u);
  });

  test("clears retained assessments when the authoritative report index is empty", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v5-reset-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    const [index] = await fixtures();
    const retained = {
      ...index.reports[0],
      assessed_at: "2026-08-02T12:06:00.000Z",
      synthesis_policy_version: "1",
      synthesis_model: "gpt-5.6-luna",
      assessment: {
        risk_level: "low",
        headline: "Low concern",
        summary: "No contextual concerns were identified in this scan.",
        minor_cautions: 0,
        material_concerns: 0,
        high_danger: 0,
        malicious_evidence: "No evidence of malicious behavior was identified.",
        cited_finding_ids: [],
        interaction_chains: [],
      },
    };
    await writeFile(
      outputPath,
      `${JSON.stringify({
        schema_version: 5,
        generated_at: index.generated_at,
        preferred_report_ids: [retained.report_id],
        reports: [retained],
      })}\n`,
    );
    const emptyIndex = {
      schema_version: 5,
      generated_at: "2026-08-03T22:31:00.000Z",
      reports: [],
    };

    await expect(
      importTavernKeeperReports({
        root,
        outputPath,
        registry,
        dnsLookup: publicDnsLookup,
        requestImpl: async () => jsonResponse(emptyIndex),
        synthesizeReport: async () => {
          throw new Error("empty indexes must not synthesize reports");
        },
      }),
    ).resolves.toEqual({
      schema_version: 6,
      generated_at: emptyIndex.generated_at,
      preferred_report_ids: [],
      reports: [],
    });
    await expect(
      readFile(outputPath, "utf8").then((contents) => JSON.parse(contents)),
    ).resolves.toEqual({
      schema_version: 6,
      generated_at: emptyIndex.generated_at,
      preferred_report_ids: [],
      reports: [],
    });
  });

  test("rejects an older empty index before it can clear retained assessments", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v5-replay-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    const [index] = await fixtures();
    const retained = assessedEntry(index.reports[0]);
    const previous = `${JSON.stringify({
      schema_version: 5,
      generated_at: "2026-08-03T22:31:00.000Z",
      preferred_report_ids: [retained.report_id],
      reports: [retained],
    })}\n`;
    await writeFile(outputPath, previous);
    const staleEmptyIndex = {
      schema_version: 5,
      generated_at: "2026-08-03T22:30:59.000Z",
      reports: [],
    };

    await expect(
      importTavernKeeperReports({
        root,
        outputPath,
        registry,
        dnsLookup: publicDnsLookup,
        requestImpl: async () => jsonResponse(staleEmptyIndex),
      }),
    ).rejects.toThrow(/older/u);
    expect(await readFile(outputPath, "utf8")).toBe(previous);
  });

  test("retains historical assessments for a non-empty authoritative index", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v5-history-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    const [index] = await fixtures();
    const current = assessedEntry(index.reports[0]);
    const historicalId = "f".repeat(64);
    const historicalSha = "b".repeat(40);
    const historical = assessedEntry(
      {
        ...index.reports[0],
        report_id: historicalId,
        report_digest: historicalId,
        scanner_policy_version: "2",
        target_sha: historicalSha,
        completed_at: "2026-08-01T12:00:00.000Z",
        report_url:
          `https://mentallyquill.github.io/TavernKeeper/reports/github/42/` +
          `${historicalSha}/2/${historicalId}/`,
      },
      { assessed_at: "2026-08-01T12:06:00.000Z" },
    );
    await writeFile(
      outputPath,
      `${JSON.stringify({
        schema_version: 5,
        generated_at: index.generated_at,
        preferred_report_ids: [current.report_id],
        reports: [historical, current],
      })}\n`,
    );

    await expect(
      importTavernKeeperReports({
        root,
        outputPath,
        registry,
        dnsLookup: publicDnsLookup,
        requestImpl: async () => jsonResponse(index),
      }),
    ).resolves.toMatchObject({
      preferred_report_ids: [current.report_id],
      reports: [historical, current],
    });
  });

  test("drops retained assessments when their source leaves the authoritative index", async () => {
    const root = await mkdtemp(
      resolve(tmpdir(), "tavernkeeper-v5-source-reset-"),
    );
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    const [index, report] = await fixtures();
    const current = assessedEntry(index.reports[0]);
    const removedReport = secondReportFrom(report);
    const removed = assessedEntry(projectIndexReport(removedReport));
    const expandedRegistry = [
      ...registry,
      {
        id: "github-43",
        type: "github",
        status: "active",
        repository_id: 43,
        repository: "owner/repo-two",
      },
    ];
    await writeFile(
      outputPath,
      `${JSON.stringify({
        schema_version: 5,
        generated_at: index.generated_at,
        preferred_report_ids: [current.report_id, removed.report_id],
        reports: [current, removed],
      })}\n`,
    );

    await expect(
      importTavernKeeperReports({
        root,
        outputPath,
        registry: expandedRegistry,
        dnsLookup: publicDnsLookup,
        requestImpl: async () => jsonResponse(index),
        synthesizeReport: async () => {
          throw new Error("matching reports must not be synthesized");
        },
      }),
    ).resolves.toMatchObject({
      preferred_report_ids: [current.report_id],
      reports: [current],
    });
  });

  test("quarantines one invalid report while importing its successful peer", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v5-import-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    const previous =
      '{\n  "schema_version": 5,\n  "generated_at": "1970-01-01T00:00:00.000Z",\n  "preferred_report_ids": [],\n  "reports": []\n}\n';
    await writeFile(outputPath, previous);
    const importStatePath = resolve(
      root,
      "data/security/tavernkeeper-import-state.json",
    );
    const [index, report] = await fixtures();
    const secondReport = secondReportFrom(report);
    const secondEntry = projectIndexReport(secondReport);
    index.reports.push(secondEntry);
    const expandedRegistry = [
      ...registry,
      {
        id: "github-43",
        type: "github",
        status: "active",
        repository_id: 43,
        repository: "owner/repo-two",
      },
    ];

    const outcome = await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry: expandedRegistry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) =>
        jsonResponse(
          url === TAVERNKEEPER_REPORT_INDEX_URL
            ? index
            : url.includes(secondReport.report_id)
              ? secondReport
              : report,
        ),
      synthesizeReport: async (currentReport: Record<string, any>) => {
        if (currentReport.repository_id === 42)
          throw new TavernKeeperSynthesisError(
            "invalid-output",
            "public_text_references",
          );
        return synthesisFor(secondEntry);
      },
      now: () => new Date("2026-08-02T12:10:00.000Z"),
      batchSize: 5,
    });

    expect(outcome).toMatchObject({
      imported: 2,
      quarantined: 1,
      skipped_quarantines: 0,
      remaining: 0,
    });
    expect(outcome.snapshot.preferred_report_ids).toEqual([
      index.reports[0].report_id,
      secondEntry.report_id,
    ]);
    expect(outcome.snapshot.reports).toEqual([
      expect.objectContaining({
        report_id: index.reports[0].report_id,
        assessment_source: "deterministic_fallback",
      }),
      expect.objectContaining({
        report_id: secondEntry.report_id,
        assessment_source: "model",
      }),
    ]);
    const stateText = await readFile(importStatePath, "utf8");
    expect(stateText).not.toContain("provider response");
    expect(JSON.parse(stateText)).toMatchObject({
      schema_version: 2,
      quarantines: [
        {
          report_id: index.reports[0].report_id,
          report_digest: index.reports[0].report_digest,
          repository_id: 42,
          synthesis_policy_version: TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
          diagnostic: "public_text_references",
          attempts: 1,
        },
      ],
    });
    expect(outcome.created_or_updated).toEqual([
      expect.objectContaining({
        report_digest: index.reports[0].report_digest,
        diagnostic: "public_text_references",
      }),
    ]);
  });

  test("retains an older assessment while preferring the current deterministic fallback", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v5-fallback-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    const importStatePath = resolve(
      root,
      "data/security/tavernkeeper-import-state.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    const [index, report] = await fixtures();
    const prior = assessedEntry(index.reports[0]);
    await writeFile(
      outputPath,
      `${JSON.stringify({
        schema_version: 5,
        generated_at: index.generated_at,
        preferred_report_ids: [prior.report_id],
        reports: [prior],
      })}\n`,
    );

    const replacement = clone(report);
    replacement.target_sha = "e".repeat(40);
    replacement.completed_at = "2026-08-02T13:00:00.000Z";
    replacement.report_version = 1;
    replacement.supersedes_report_id = null;
    const rebound = rebindReport(replacement);
    const replacementEntry = projectIndexReport(rebound);
    const replacementIndex = {
      ...index,
      generated_at: "2026-08-02T13:01:00.000Z",
      reports: [replacementEntry],
    };

    const outcome = await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) =>
        jsonResponse(
          url === TAVERNKEEPER_REPORT_INDEX_URL ? replacementIndex : rebound,
        ),
      synthesizeReport: async () => {
        throw new TavernKeeperSynthesisError(
          "invalid-output",
          "response_schema",
        );
      },
      now: () => new Date("2026-08-02T13:05:00.000Z"),
    });

    expect(outcome.snapshot.preferred_report_ids).toEqual([
      replacementEntry.report_id,
    ]);
    expect(outcome.snapshot.reports).toEqual([
      expect.objectContaining({ report_id: prior.report_id }),
      expect.objectContaining({
        report_id: replacementEntry.report_id,
        assessment_source: "deterministic_fallback",
      }),
    ]);
    expect(outcome.import_state.quarantines).toEqual([
      expect.objectContaining({ report_id: replacementEntry.report_id }),
    ]);
  });

  test("skips an exact quarantine while later reports import and explicit retry recovers it", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v5-order-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    const importStatePath = resolve(
      root,
      "data/security/tavernkeeper-import-state.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    await writeFile(
      outputPath,
      '{"schema_version":5,"generated_at":"1970-01-01T00:00:00.000Z","preferred_report_ids":[],"reports":[]}\n',
    );
    const [index, report] = await fixtures();

    await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) =>
        jsonResponse(url === TAVERNKEEPER_REPORT_INDEX_URL ? index : report),
      synthesizeReport: async () => {
        throw new TavernKeeperSynthesisError(
          "invalid-output",
          "unknown_candidate_ids",
        );
      },
      now: () => new Date("2026-08-02T12:10:00.000Z"),
    });

    const secondReport = secondReportFrom(report);
    const secondEntry = projectIndexReport(secondReport);
    const expandedIndex = {
      ...index,
      reports: [...index.reports, secondEntry],
    };
    const expandedRegistry = [
      ...registry,
      {
        id: "github-43",
        type: "github",
        status: "active",
        repository_id: 43,
        repository: "owner/repo-two",
      },
    ];
    const synthesizedRepositories: number[] = [];
    const outcome = await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry: expandedRegistry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) =>
        jsonResponse(
          url === TAVERNKEEPER_REPORT_INDEX_URL
            ? expandedIndex
            : url.includes(secondReport.report_id)
              ? secondReport
              : report,
        ),
      synthesizeReport: async (currentReport: Record<string, any>) => {
        synthesizedRepositories.push(currentReport.repository_id);
        return synthesisFor(secondEntry);
      },
      now: () => new Date("2026-08-02T12:11:00.000Z"),
    });

    expect(synthesizedRepositories).toEqual([43]);
    expect(outcome.import_state.quarantines).toEqual([
      expect.objectContaining({ repository_id: 42 }),
    ]);
    expect(outcome.skipped_quarantines).toBe(1);
    expect(outcome.snapshot.preferred_report_ids).toEqual([
      index.reports[0].report_id,
      secondEntry.report_id,
    ]);

    const recovered = await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry: expandedRegistry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) =>
        jsonResponse(
          url === TAVERNKEEPER_REPORT_INDEX_URL
            ? expandedIndex
            : url.includes(secondReport.report_id)
              ? secondReport
              : report,
        ),
      synthesizeReport: async () => synthesisFor(index.reports[0]),
      retryReportDigest: index.reports[0].report_digest,
      now: () => new Date("2026-08-02T12:12:00.000Z"),
    });

    expect(recovered.import_state.quarantines).toEqual([]);
    expect(recovered.snapshot.preferred_report_ids).toEqual([
      index.reports[0].report_id,
      secondEntry.report_id,
    ]);
    expect(recovered.resolved).toEqual([
      expect.objectContaining({
        report_digest: index.reports[0].report_digest,
      }),
    ]);
  });

  test("retries a quarantined digest after the synthesis policy changes", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v5-policy-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    const importStatePath = resolve(
      root,
      "data/security/tavernkeeper-import-state.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    await writeFile(
      outputPath,
      '{"schema_version":5,"generated_at":"1970-01-01T00:00:00.000Z","preferred_report_ids":[],"reports":[]}\n',
    );
    const [index, report] = await fixtures();
    await writeFile(
      importStatePath,
      `${JSON.stringify({
        schema_version: 2,
        updated_at: "2026-08-02T11:00:00.000Z",
        quarantines: [
          {
            report_id: index.reports[0].report_id,
            report_digest: index.reports[0].report_digest,
            repository_id: 42,
            repository: "owner/repo",
            target_sha: index.reports[0].target_sha,
            synthesis_policy_version: "1",
            diagnostic: "count_mismatch",
            first_failed_at: "2026-08-02T11:00:00.000Z",
            last_failed_at: "2026-08-02T11:00:00.000Z",
            attempts: 2,
          },
        ],
      })}\n`,
    );
    let synthesisCalls = 0;

    const outcome = await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) =>
        jsonResponse(url === TAVERNKEEPER_REPORT_INDEX_URL ? index : report),
      synthesizeReport: async () => {
        synthesisCalls += 1;
        return synthesisFor(index.reports[0]);
      },
      now: () => new Date("2026-08-02T12:00:00.000Z"),
    });

    expect(synthesisCalls).toBe(1);
    expect(outcome.import_state.quarantines).toEqual([]);
    expect(outcome.snapshot.preferred_report_ids).toEqual([
      index.reports[0].report_id,
    ]);
    expect(outcome.resolved).toEqual([
      expect.objectContaining({ synthesis_policy_version: "1" }),
    ]);
  });

  test("keeps a current report preferred through deterministic fallback on explicit retry", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v5-retry-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    const importStatePath = resolve(
      root,
      "data/security/tavernkeeper-import-state.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    const [index, report] = await fixtures();
    const prior = assessedEntry(index.reports[0]);
    await writeFile(
      outputPath,
      `${JSON.stringify({
        schema_version: 5,
        generated_at: index.generated_at,
        preferred_report_ids: [prior.report_id],
        reports: [prior],
      })}\n`,
    );

    const outcome = await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) =>
        jsonResponse(url === TAVERNKEEPER_REPORT_INDEX_URL ? index : report),
      synthesizeReport: async () => {
        throw new TavernKeeperSynthesisError(
          "invalid-output",
          "response_schema",
        );
      },
      retryReportDigest: index.reports[0].report_digest,
      now: () => new Date("2026-08-02T13:05:00.000Z"),
    });

    expect(outcome.snapshot.reports).toEqual([
      expect.objectContaining({
        report_id: prior.report_id,
        assessment_source: "deterministic_fallback",
      }),
    ]);
    expect(outcome.snapshot.preferred_report_ids).toEqual([prior.report_id]);
    expect(outcome.import_state.quarantines).toEqual([
      expect.objectContaining({
        report_digest: index.reports[0].report_digest,
      }),
    ]);
  });

  test("treats a changed report digest as new eligible work", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v5-digest-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    const importStatePath = resolve(
      root,
      "data/security/tavernkeeper-import-state.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    await writeFile(
      outputPath,
      '{"schema_version":5,"generated_at":"1970-01-01T00:00:00.000Z","preferred_report_ids":[],"reports":[]}\n',
    );
    const [index, report] = await fixtures();
    await writeFile(
      importStatePath,
      `${JSON.stringify({
        schema_version: 2,
        updated_at: "2026-08-02T11:00:00.000Z",
        quarantines: [
          {
            report_id: index.reports[0].report_id,
            report_digest: index.reports[0].report_digest,
            repository_id: 42,
            repository: "owner/repo",
            target_sha: index.reports[0].target_sha,
            synthesis_policy_version: TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
            diagnostic: "count_mismatch",
            first_failed_at: "2026-08-02T11:00:00.000Z",
            last_failed_at: "2026-08-02T11:00:00.000Z",
            attempts: 1,
          },
        ],
      })}\n`,
    );
    const replacement = clone(report);
    replacement.target_sha = "e".repeat(40);
    replacement.completed_at = "2026-08-02T13:00:00.000Z";
    const rebound = rebindReport(replacement);
    const replacementEntry = projectIndexReport(rebound);
    const replacementIndex = {
      ...index,
      generated_at: "2026-08-02T13:01:00.000Z",
      reports: [replacementEntry],
    };
    let synthesisCalls = 0;

    const outcome = await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) =>
        jsonResponse(
          url === TAVERNKEEPER_REPORT_INDEX_URL ? replacementIndex : rebound,
        ),
      synthesizeReport: async () => {
        synthesisCalls += 1;
        return synthesisFor(replacementEntry);
      },
      now: () => new Date("2026-08-02T13:05:00.000Z"),
    });

    expect(synthesisCalls).toBe(1);
    expect(outcome.snapshot.preferred_report_ids).toEqual([
      replacementEntry.report_id,
    ]);
    expect(outcome.import_state.quarantines).toEqual([]);
    expect(outcome.resolved).toEqual([
      expect.objectContaining({
        report_digest: index.reports[0].report_digest,
      }),
    ]);
  });

  test("publishes a deterministic fallback for provider failures", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v5-provider-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    const importStatePath = resolve(
      root,
      "data/security/tavernkeeper-import-state.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    await writeFile(
      outputPath,
      '{"schema_version":5,"generated_at":"1970-01-01T00:00:00.000Z","preferred_report_ids":[],"reports":[]}\n',
    );
    const initialState =
      '{"schema_version":2,"updated_at":"1970-01-01T00:00:00.000Z","quarantines":[]}\n';
    await writeFile(importStatePath, initialState);
    const [index, report] = await fixtures();

    const outcome = await reconcileTavernKeeperReports({
      root,
      outputPath,
      importStatePath,
      registry,
      dnsLookup: publicDnsLookup,
      requestImpl: async (url: string) =>
        jsonResponse(url === TAVERNKEEPER_REPORT_INDEX_URL ? index : report),
      synthesizeReport: async () => {
        throw new TavernKeeperSynthesisError(
          "provider-transient",
          "provider-timeout",
        );
      },
      now: () => new Date("2026-08-02T12:00:00.000Z"),
    });

    expect(outcome.snapshot).toMatchObject({
      schema_version: 6,
      preferred_report_ids: [index.reports[0].report_id],
      reports: [
        {
          report_id: index.reports[0].report_id,
          assessment_source: "deterministic_fallback",
          synthesis_model: "deterministic-policy-v4",
        },
      ],
    });
    expect(outcome.import_state.quarantines).toEqual([
      expect.objectContaining({ diagnostic: "provider-timeout" }),
    ]);
  });
});
