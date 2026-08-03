import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { importTavernKeeperReports } from "../../scripts/security/import-tavernkeeper-reports.mjs";
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
      review_required: report.review_coverage.required,
      review_completed: report.review_coverage.completed,
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

function publicDnsLookup() {
  return Promise.resolve([{ address: "8.8.8.8", family: 4 }]);
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

describe("TavernKeeper V5 report import", () => {
  test("accepts only scanner policy 3 as active catalog evidence", () => {
    expect(ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION).toBe("3");
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

    expect(validateStoredReportIndex(stored, registry)).toEqual(stored);
    expect(() =>
      validateStoredReportIndex(
        { ...stored, preferred_report_ids: ["f".repeat(64)] },
        registry,
      ),
    ).toThrow(/preferred/u);
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

    expect(validateStoredReportIndex(snapshot, registry)).toEqual(snapshot);
    expect(() =>
      validateStoredReportIndex(
        { ...snapshot, preferred_report_ids: [historical.report_id] },
        registry,
      ),
    ).toThrow(/policy/u);
  });

  test("preserves the previous snapshot when synthesis fails", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-v5-import-"));
    const outputPath = resolve(
      root,
      "data/security/tavernkeeper-report-summaries.json",
    );
    await mkdir(resolve(root, "data/security"), { recursive: true });
    const previous =
      '{\n  "schema_version": 5,\n  "generated_at": "1970-01-01T00:00:00.000Z",\n  "preferred_report_ids": [],\n  "reports": []\n}\n';
    await writeFile(outputPath, previous);
    const [index, report] = await fixtures();

    await expect(
      importTavernKeeperReports({
        root,
        outputPath,
        registry,
        dnsLookup: publicDnsLookup,
        requestImpl: async (url: string) =>
          jsonResponse(url === TAVERNKEEPER_REPORT_INDEX_URL ? index : report),
        synthesizeReport: async () => {
          throw new Error("provider failed");
        },
      }),
    ).rejects.toThrow(/provider failed/u);
    expect(await readFile(outputPath, "utf8")).toBe(previous);
  });
});
