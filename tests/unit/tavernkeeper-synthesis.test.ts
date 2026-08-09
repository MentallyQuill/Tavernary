import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test, vi } from "vitest";

import { EnrichmentProviderError } from "../../scripts/catalog/enrichment-provider.mjs";
import {
  buildDeterministicAssessment,
  deriveEvidenceFloor,
  deriveProjectAdvisory,
  deriveReportAdvisory,
  TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
  TavernaryAssessmentValidationError,
  tavernKeeperAssessmentRequirements,
  validateTavernaryAssessment,
} from "../../scripts/security/tavernkeeper-assessment-contract.mjs";
import { createTavernKeeperSynthesisProvider } from "../../scripts/security/tavernkeeper-synthesis-provider.mjs";
import {
  synthesizeTavernKeeperReport,
  TavernKeeperSynthesisError,
} from "../../scripts/security/tavernkeeper-synthesis.mjs";
import type { TavernKeeperContextualItemV5 } from "../../scripts/security/tavernkeeper-reports.mjs";

const candidateId = "b".repeat(64);
const evidenceId = "c".repeat(64);
const reportFixturePath = resolve(
  "tests/fixtures/tavernkeeper/scan-report.v5.valid.json",
);

async function fixture() {
  return JSON.parse(await readFile(reportFixturePath, "utf8"));
}

function assessment(
  overrides: Partial<TavernKeeperContextualItemV5> = {},
): TavernKeeperContextualItemV5 {
  return {
    candidate_id: candidateId,
    evidence_ids: [evidenceId],
    disposition: "expected_behavior",
    impact: "low",
    exploitability: "unlikely",
    confidence: "high",
    recommended_risk: "low",
    technical_explanation: "The behavior matches the documented feature.",
    layman_explanation: "The flagged code is expected for this extension.",
    developer_action: "Keep this boundary documented and tested.",
    locations: [{ path: "src/index.js", line_start: 10, line_end: 12 }],
    ...overrides,
  };
}

function reportWith(
  items: TavernKeeperContextualItemV5[],
  candidateOverrides: Array<Record<string, unknown>> = [],
  contextualReviewPolicyVersion = "3",
) {
  return {
    report_id: "d".repeat(64),
    target_sha: "a".repeat(40),
    repository: "owner/repo",
    contextual_review_policy_version: contextualReviewPolicyVersion,
    counts: {
      disposition: {
        expected_behavior: items.filter(
          (item) => item.disposition === "expected_behavior",
        ).length,
        minor_weakness: items.filter(
          (item) => item.disposition === "minor_weakness",
        ).length,
        material_vulnerability: items.filter(
          (item) => item.disposition === "material_vulnerability",
        ).length,
        credible_malicious_behavior: items.filter(
          (item) => item.disposition === "credible_malicious_behavior",
        ).length,
      },
    },
    candidates: items.map((item, index) => ({
      candidate_id: item.candidate_id ?? String(index + 1).padStart(64, "0"),
      origin: "tavernkeeper",
      rule_id: "test.rule",
      category: "security",
      scanner_severity: "medium",
      scanner_confidence: "medium",
      file_role: "production",
      title: "Security-sensitive behavior",
      explanation: "The scanner identified security-sensitive behavior.",
      ...candidateOverrides[index],
    })),
    assessments: items,
    observations: [],
  };
}

function lowOutput(overrides: Record<string, unknown> = {}) {
  return {
    risk_level: "low",
    headline: "Low concern",
    summary: "The reviewed behavior matches the extension's stated purpose.",
    minor_cautions: 0,
    material_concerns: 0,
    high_danger: 0,
    malicious_evidence: "No evidence of malicious behavior was identified.",
    cited_finding_ids: [],
    interaction_chains: [],
    ...overrides,
  };
}

function validationFailure(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected Tavernary assessment validation to fail");
}

describe("TavernKeeper evidence floors", () => {
  test("raises high-confidence credible malicious behavior to high", () => {
    expect(
      deriveEvidenceFloor([
        assessment({
          disposition: "credible_malicious_behavior",
          impact: "high",
          exploitability: "plausible",
          confidence: "high",
          recommended_risk: "high",
        }),
      ]),
    ).toBe("high");
  });

  test("raises a high-confidence critical readily exploitable vulnerability to high", () => {
    expect(
      deriveEvidenceFloor([
        assessment({
          disposition: "material_vulnerability",
          impact: "critical",
          exploitability: "readily_exploitable",
          confidence: "high",
          recommended_risk: "high",
        }),
      ]),
    ).toBe("high");
  });

  test("keeps unresolved medium-confidence material-looking evidence low", () => {
    expect(
      deriveEvidenceFloor([
        assessment({
          disposition: "material_vulnerability",
          impact: "medium",
          exploitability: "plausible",
          confidence: "medium",
          recommended_risk: "material",
        }),
      ]),
    ).toBe("low");
  });

  test("calibrates a non-demonstrated high recommendation as a minor caution", () => {
    const report = reportWith([
      assessment({
        disposition: "material_vulnerability",
        impact: "critical",
        exploitability: "plausible",
        confidence: "medium",
        recommended_risk: "high",
      }),
    ]);

    expect(tavernKeeperAssessmentRequirements(report)).toMatchObject({
      evidence_floor: "low",
      required_counts: {
        minor_cautions: 1,
        material_concerns: 0,
        high_danger: 0,
      },
    });
  });

  test("keeps expected behavior and minor weaknesses low", () => {
    expect(
      deriveEvidenceFloor([
        assessment(),
        assessment({
          candidate_id: "e".repeat(64),
          disposition: "minor_weakness",
        }),
      ]),
    ).toBe("low");
  });

  test("keeps low-confidence material-looking evidence visible as a low advisory", () => {
    expect(
      deriveEvidenceFloor([
        assessment({
          candidate_id: "f".repeat(64),
          disposition: "material_vulnerability",
          confidence: "low",
          recommended_risk: "material",
        }),
      ]),
    ).toBe("low");
  });
});

describe("TavernKeeper deterministic project advisory", () => {
  test("keeps incomplete policy-4 JavaScript coverage teal", async () => {
    const report = await fixture();
    report.scanner_policy_version = "4";
    report.coverage.javascript_analysis = {
      status: "incomplete",
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
      unresolved: [
        {
          path: "dist/index.min.js",
          stage: "normalize",
          reason: "timeout",
          recovered: false,
        },
      ],
    };

    expect(deriveReportAdvisory(report)).toEqual({
      risk_level: "low",
      danger_basis: "none",
    });
    expect(tavernKeeperAssessmentRequirements(report)).toMatchObject({
      evidence_floor: "low",
    });
    expect(buildDeterministicAssessment(report)).toMatchObject({
      risk_level: "low",
      summary: expect.stringMatching(/technical report.*limitations/iu),
    });
  });

  test("keeps metadata-only contextual coverage teal", async () => {
    const report = Object.assign(await fixture(), reportWith([assessment()]));
    report.coverage.evidence_validation = {
      status: "completed-with-limitations",
      validated_candidates: 1,
      metadata_only_candidates: 1,
    };

    expect(deriveReportAdvisory(report)).toEqual({
      risk_level: "low",
      danger_basis: "none",
    });
    expect(tavernKeeperAssessmentRequirements(report)).toMatchObject({
      evidence_floor: "low",
    });
    expect(buildDeterministicAssessment(report)).toMatchObject({
      risk_level: "low",
      summary: expect.stringMatching(/technical report.*limitations/iu),
    });
  });

  test("turns only demonstrated material risk yellow", () => {
    expect(
      deriveProjectAdvisory(
        [
          assessment({
            disposition: "material_vulnerability",
            impact: "medium",
            exploitability: "plausible",
            confidence: "high",
            recommended_risk: "material",
            risk_exposure: "demonstrated",
          }),
        ],
        undefined,
        "3",
      ),
    ).toEqual({ risk_level: "material", danger_basis: "none" });

    expect(
      deriveProjectAdvisory(
        [
          assessment({
            disposition: "material_vulnerability",
            impact: "critical",
            exploitability: "readily_exploitable",
            confidence: "high",
            recommended_risk: "high",
            risk_exposure: "not_demonstrated",
          }),
        ],
        undefined,
        "3",
      ),
    ).toEqual({ risk_level: "low", danger_basis: "none" });
  });

  test("keeps legacy dependency and broad-correlation evidence teal", () => {
    const dependency = assessment({
      disposition: "material_vulnerability",
      impact: "critical",
      exploitability: "plausible",
      confidence: "high",
      recommended_risk: "material",
      technical_explanation:
        "The affected package version and runtime reachability are not demonstrated.",
    });
    const correlation = assessment({
      candidate_id: "e".repeat(64),
      disposition: "material_vulnerability",
      impact: "high",
      exploitability: "plausible",
      confidence: "high",
      recommended_risk: "material",
      technical_explanation:
        "The source and sink occur in the same file, but no concrete data flow is demonstrated.",
    });
    const report = reportWith(
      [dependency, correlation],
      [
        {
          origin: "osv-scanner",
          rule_id: "GHSA-example",
          category: "known-vulnerability",
          file_role: "production",
          title: "Known dependency advisory",
        },
        {
          origin: "javascript-analysis",
          rule_id: "javascript.download-to-execution",
          category: "code-execution",
          file_role: "production",
          title: "Network retrieval is correlated with an execution sink",
          explanation:
            "The primitives occur in the same representation; data flow was not established.",
        },
      ],
      "2",
    );

    expect(deriveReportAdvisory(report)).toEqual({
      risk_level: "low",
      danger_basis: "none",
    });
    expect(tavernKeeperAssessmentRequirements(report).required_counts).toEqual({
      minor_cautions: 2,
      material_concerns: 0,
      high_danger: 0,
    });
  });

  test.each(["test", "fixture", "documentation", "tooling"])(
    "keeps a legacy %s finding teal",
    (fileRole) => {
      const item = assessment({
        disposition: "material_vulnerability",
        impact: "high",
        exploitability: "plausible",
        confidence: "high",
        recommended_risk: "material",
      });
      const report = reportWith([item], [{ file_role: fileRole }], "2");

      expect(deriveReportAdvisory(report)).toEqual({
        risk_level: "low",
        danger_basis: "none",
      });
      expect(
        tavernKeeperAssessmentRequirements(report).required_counts,
      ).toEqual({
        minor_cautions: 1,
        material_concerns: 0,
        high_danger: 0,
      });
    },
  );

  test.each([
    ["non-shipped file role", { file_role: "test" }, {}],
    ["OSV origin", { origin: "osv-scanner" }, {}],
    [
      "unconfirmed reachability prose",
      {},
      {
        technical_explanation:
          "Runtime reachability is not demonstrated by the available evidence.",
      },
    ],
  ])("preserves legacy red for %s", (_label, candidate, itemOverrides) => {
    const item = assessment({
      disposition: "material_vulnerability",
      impact: "critical",
      exploitability: "readily_exploitable",
      confidence: "high",
      recommended_risk: "high",
      ...itemOverrides,
    });
    const report = reportWith([item], [candidate], "2");

    expect(deriveReportAdvisory(report)).toEqual({
      risk_level: "high",
      danger_basis: "critical_exploitable_vulnerability",
    });
    expect(tavernKeeperAssessmentRequirements(report).required_counts).toEqual({
      minor_cautions: 0,
      material_concerns: 0,
      high_danger: 1,
    });
  });

  test("keeps a concrete legacy shipped-code execution vulnerability yellow", () => {
    const item = assessment({
      disposition: "material_vulnerability",
      impact: "high",
      exploitability: "plausible",
      confidence: "high",
      recommended_risk: "material",
      technical_explanation:
        "A user-controlled imported template reaches eval in shipped extension code.",
      layman_explanation:
        "Opening an untrusted template can execute code in the extension.",
    });
    const report = reportWith(
      [item],
      [
        {
          origin: "opengrep",
          rule_id: "javascript.imported-template-execution",
          category: "code-execution",
          file_role: "production",
          title: "Imported template content reaches dynamic execution",
        },
      ],
      "2",
    );

    expect(deriveReportAdvisory(report)).toEqual({
      risk_level: "material",
      danger_basis: "none",
    });
    expect(tavernKeeperAssessmentRequirements(report).required_counts).toEqual({
      minor_cautions: 0,
      material_concerns: 1,
      high_danger: 0,
    });
  });

  test("calibrates all public counts from classified risk", () => {
    const items = [
      assessment(),
      assessment({
        candidate_id: "1".repeat(64),
        disposition: "minor_weakness",
      }),
      assessment({
        candidate_id: "2".repeat(64),
        disposition: "material_vulnerability",
        impact: "high",
        exploitability: "plausible",
        confidence: "high",
        recommended_risk: "material",
        risk_exposure: "not_demonstrated",
      }),
      assessment({
        candidate_id: "3".repeat(64),
        disposition: "material_vulnerability",
        impact: "medium",
        exploitability: "plausible",
        confidence: "high",
        recommended_risk: "material",
        risk_exposure: "demonstrated",
      }),
      assessment({
        candidate_id: "4".repeat(64),
        disposition: "material_vulnerability",
        impact: "critical",
        exploitability: "readily_exploitable",
        confidence: "high",
        recommended_risk: "high",
        risk_exposure: "demonstrated",
      }),
    ];

    expect(tavernKeeperAssessmentRequirements(reportWith(items))).toMatchObject(
      {
        evidence_floor: "high",
        required_counts: {
          minor_cautions: 2,
          material_concerns: 1,
          high_danger: 1,
        },
      },
    );
  });

  test("does not activate policy-3 exposure semantics on a policy-2 report", () => {
    const item = assessment({
      disposition: "material_vulnerability",
      impact: "medium",
      exploitability: "plausible",
      confidence: "high",
      recommended_risk: "material",
      risk_exposure: "demonstrated",
    });
    const candidate = {
      origin: "osv-scanner",
      rule_id: "GHSA-example",
      category: "known-vulnerability",
      file_role: "production",
      title: "Known dependency advisory",
    };

    expect(deriveReportAdvisory(reportWith([item], [candidate], "2"))).toEqual({
      risk_level: "low",
      danger_basis: "none",
    });
    expect(deriveReportAdvisory(reportWith([item], [candidate], "3"))).toEqual({
      risk_level: "material",
      danger_basis: "none",
    });
  });

  test("identifies high-confidence malicious behavior as immediate danger", () => {
    expect(
      deriveProjectAdvisory(
        [
          assessment({
            disposition: "credible_malicious_behavior",
            impact: "critical",
            exploitability: "readily_exploitable",
            confidence: "high",
            recommended_risk: "high",
            risk_exposure: "demonstrated",
          }),
        ],
        undefined,
        "3",
      ),
    ).toEqual({
      risk_level: "high",
      danger_basis: "malicious_or_compromised",
    });
  });

  test("identifies a critical readily exploitable vulnerability as immediate danger", () => {
    expect(
      deriveProjectAdvisory(
        [
          assessment({
            disposition: "material_vulnerability",
            impact: "critical",
            exploitability: "readily_exploitable",
            confidence: "high",
            recommended_risk: "high",
            risk_exposure: "demonstrated",
          }),
        ],
        undefined,
        "3",
      ),
    ).toEqual({
      risk_level: "high",
      danger_basis: "critical_exploitable_vulnerability",
    });
  });

  test("identifies mixed immediate-danger evidence", () => {
    expect(
      deriveProjectAdvisory(
        [
          assessment({
            disposition: "credible_malicious_behavior",
            impact: "critical",
            exploitability: "readily_exploitable",
            confidence: "high",
            recommended_risk: "high",
            risk_exposure: "demonstrated",
          }),
          assessment({
            candidate_id: "e".repeat(64),
            disposition: "material_vulnerability",
            impact: "critical",
            exploitability: "readily_exploitable",
            confidence: "high",
            recommended_risk: "high",
            risk_exposure: "demonstrated",
          }),
        ],
        undefined,
        "3",
      ),
    ).toEqual({ risk_level: "high", danger_basis: "mixed" });
  });

  test("builds policy-owned fallback copy and exact counts", () => {
    const report = reportWith([
      assessment({
        disposition: "material_vulnerability",
        impact: "critical",
        exploitability: "readily_exploitable",
        confidence: "high",
        recommended_risk: "high",
        risk_exposure: "demonstrated",
      }),
    ]);

    expect(buildDeterministicAssessment(report)).toEqual({
      risk_level: "high",
      headline: "Immediate danger identified",
      summary:
        "TavernKeeper identified immediate-danger evidence at the scanned commit. The detailed generated summary was unavailable; review the complete technical report before installing or using this project.",
      minor_cautions: 0,
      material_concerns: 0,
      high_danger: 1,
      malicious_evidence:
        "No credible malicious behavior was identified; the immediate-danger result is based on a critical, readily exploitable vulnerability.",
      cited_finding_ids: [candidateId],
      interaction_chains: [],
    });
  });

  test("types the classifier candidate metadata used by deterministic builds", () => {
    const typedCandidate: Parameters<
      typeof buildDeterministicAssessment
    >[0]["candidates"][number] = {
      candidate_id: candidateId,
      origin: "opengrep",
      file_role: "production",
      title: "Imported content reaches execution",
      explanation: "Untrusted imported content reaches an execution sink.",
      category: "code-execution",
    };

    expect(typedCandidate).toMatchObject({
      origin: "opengrep",
      file_role: "production",
    });
  });
});

describe("Tavernary final assessment contract", () => {
  test("accepts a cited, count-matched assessment at the evidence floor", () => {
    const item = assessment({ disposition: "minor_weakness" });
    const report = reportWith([item]);
    const output = lowOutput({
      minor_cautions: 1,
      cited_finding_ids: [candidateId],
    });

    expect(validateTavernaryAssessment(output, report)).toEqual(output);
  });

  test("returns bounded repair data for unknown candidate citations", () => {
    const unknownId = "f".repeat(64);
    const error = validationFailure(() =>
      validateTavernaryAssessment(
        lowOutput({ cited_finding_ids: [unknownId] }),
        reportWith([assessment()]),
      ),
    );

    expect(error).toBeInstanceOf(TavernaryAssessmentValidationError);
    expect(error).toMatchObject({
      diagnostic: "unknown_candidate_ids",
      repair: {
        rejected_candidate_ids: [unknownId],
        allowed_candidate_ids: [candidateId],
        required_counts: {
          minor_cautions: 0,
          material_concerns: 0,
          high_danger: 0,
        },
      },
    });
  });

  test("rejects unsafe public prose", () => {
    expect(
      validationFailure(() =>
        validateTavernaryAssessment(
          lowOutput({ summary: "<script>alert(1)</script>" }),
          reportWith([]),
        ),
      ),
    ).toMatchObject({ diagnostic: "response_schema" });
  });

  test.each([
    ["headline", { headline: `Low concern ${candidateId}` }],
    ["summary", { summary: `Visible explanation ${candidateId}` }],
    [
      "malicious evidence",
      { malicious_evidence: `No malicious behavior ${candidateId}` },
    ],
    [
      "interaction explanation",
      {
        interaction_chains: [
          {
            finding_ids: [candidateId, "e".repeat(64)],
            resulting_risk: "material",
            explanation: `Combined behavior ${candidateId}`,
          },
        ],
      },
    ],
    [
      "encoded citation",
      { summary: "Visible explanation \uE200cite\uE202reference\uE201" },
    ],
  ])("rejects internal references in public %s prose", (_label, overrides) => {
    const error = validationFailure(() =>
      validateTavernaryAssessment(lowOutput(overrides), reportWith([])),
    );

    expect(error).toMatchObject({
      diagnostic: "public_text_references",
      repair: {
        allowed_candidate_ids: [],
        required_counts: {
          minor_cautions: 0,
          material_concerns: 0,
          high_danger: 0,
        },
      },
    });
  });

  test("returns exact deterministic counts when model counts differ", () => {
    const report = reportWith([assessment({ disposition: "minor_weakness" })]);
    const error = validationFailure(() =>
      validateTavernaryAssessment(
        lowOutput({ cited_finding_ids: [candidateId] }),
        report,
      ),
    );

    expect(error).toMatchObject({
      diagnostic: "count_mismatch",
      repair: {
        allowed_candidate_ids: [candidateId],
        required_counts: {
          minor_cautions: 1,
          material_concerns: 0,
          high_danger: 0,
        },
      },
    });
  });

  test("types every contextual validation boundary", () => {
    const minorReport = reportWith([
      assessment({ disposition: "minor_weakness" }),
    ]);
    expect(
      validationFailure(() =>
        validateTavernaryAssessment(
          lowOutput({ minor_cautions: 1 }),
          minorReport,
        ),
      ),
    ).toMatchObject({
      diagnostic: "missing_candidate_ids",
      repair: { required_candidate_ids: [candidateId] },
    });

    const secondId = "e".repeat(64);
    const thirdId = "f".repeat(64);
    const chainReport = reportWith([
      assessment(),
      assessment({ candidate_id: secondId }),
      assessment({ candidate_id: thirdId }),
    ]);
    expect(
      validationFailure(() =>
        validateTavernaryAssessment(
          lowOutput({
            risk_level: "material",
            cited_finding_ids: [candidateId, secondId],
            interaction_chains: [
              {
                finding_ids: [candidateId, thirdId],
                resulting_risk: "material",
                explanation: "Two validated findings interact.",
              },
            ],
          }),
          chainReport,
        ),
      ),
    ).toMatchObject({ diagnostic: "interaction_chain_ids" });

    const materialReport = reportWith([
      assessment({
        disposition: "material_vulnerability",
        impact: "medium",
        exploitability: "plausible",
        confidence: "high",
        recommended_risk: "material",
        risk_exposure: "demonstrated",
      }),
    ]);
    expect(
      validationFailure(() =>
        validateTavernaryAssessment(
          lowOutput({
            material_concerns: 1,
            cited_finding_ids: [candidateId],
          }),
          materialReport,
        ),
      ),
    ).toMatchObject({ diagnostic: "below_evidence_floor" });

    expect(
      validationFailure(() =>
        validateTavernaryAssessment(
          lowOutput({ risk_level: "material" }),
          reportWith([]),
        ),
      ),
    ).toMatchObject({ diagnostic: "unsupported_escalation" });
  });

  test("rejects a grade below the deterministic evidence floor", () => {
    const report = reportWith([
      assessment({
        disposition: "material_vulnerability",
        impact: "medium",
        exploitability: "plausible",
        confidence: "high",
        recommended_risk: "material",
        risk_exposure: "demonstrated",
      }),
    ]);

    expect(() =>
      validateTavernaryAssessment(
        lowOutput({
          material_concerns: 1,
          cited_finding_ids: [candidateId],
        }),
        report,
      ),
    ).toThrow(/floor/u);
  });

  test("rejects escalation beyond the floor without a cited interaction chain", () => {
    const report = reportWith([assessment({ disposition: "minor_weakness" })]);
    expect(
      validationFailure(() =>
        validateTavernaryAssessment(
          lowOutput({
            risk_level: "material",
            minor_cautions: 1,
            cited_finding_ids: [candidateId],
          }),
          report,
        ),
      ),
    ).toMatchObject({
      diagnostic: "unsupported_escalation",
      repair: {
        required_candidate_ids: [candidateId],
        evidence_floor: "low",
        rejected_risk_level: "material",
        required_risk_level: "low",
      },
    });
  });

  test("rejects a causal interaction that tries to select the project color", () => {
    const secondId = "e".repeat(64);
    const report = reportWith([
      assessment({ disposition: "minor_weakness" }),
      assessment({
        candidate_id: secondId,
        disposition: "minor_weakness",
      }),
    ]);
    const output = lowOutput({
      risk_level: "material",
      minor_cautions: 2,
      cited_finding_ids: [candidateId, secondId],
      interaction_chains: [
        {
          finding_ids: [candidateId, secondId],
          resulting_risk: "material",
          explanation:
            "Together these boundaries could expose data to an untrusted input.",
        },
      ],
    });

    expect(
      validationFailure(() => validateTavernaryAssessment(output, report)),
    ).toMatchObject({ diagnostic: "unsupported_escalation" });
  });
});

describe("strict Luna synthesis", () => {
  test("uses the shared provider transport with Tavernary's strict schema", async () => {
    const report = await fixture();
    report.candidates = [{ candidate_id: candidateId }];
    report.assessments = [
      assessment({
        disposition: "minor_weakness",
        risk_exposure: "not_demonstrated",
      }),
    ];
    report.observations = [
      {
        observation_id: "e".repeat(64),
        related_candidate_ids: [candidateId],
        disposition: "minor_weakness",
        impact: "low",
        exploitability: "unlikely",
        confidence: "medium",
        recommended_risk: "low",
        title: "Related observation",
        layman_explanation: "A related boundary deserves caution.",
        developer_action: "Keep the boundary documented.",
      },
    ];
    let requestBody: any;
    const provider = createTavernKeeperSynthesisProvider({
      apiUrl: "https://provider.example/v1/chat/completions",
      apiKey: "secret",
      model: "gpt-5.6-luna",
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            model: "gpt-5.6-luna",
            choices: [{ message: { content: JSON.stringify(lowOutput()) } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const repair = {
      diagnostic: "count_mismatch",
      allowed_candidate_ids: [candidateId],
      evidence_floor: "low" as const,
      required_counts: {
        minor_cautions: 2,
        material_concerns: 0,
        high_danger: 0,
      },
    };
    await provider.generate({ report, repair });

    expect(requestBody).not.toHaveProperty("temperature");
    expect(requestBody.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "tavernary_tavernkeeper_assessment_v1",
        strict: true,
      },
    });
    expect(JSON.stringify(requestBody.response_format)).not.toContain(
      "uniqueItems",
    );
    expect(requestBody.messages[0].content).toContain(
      "synthesizing validated assessments, not rescanning code",
    );
    expect(requestBody.messages[0].content).toContain(
      "Observation IDs are never valid citations",
    );
    expect(requestBody.messages[0].content).toContain(
      "Never put finding IDs or citation markers in visitor-facing prose",
    );
    expect(requestBody.messages[0].content).toContain(
      "A nonzero high_danger count requires the project risk level to be high",
    );
    expect(requestBody.messages[0].content).toContain(
      "risk_level must exactly equal required_project_advisory.risk_level",
    );
    expect(requestBody.messages[0].content).toContain(
      "does not cause harm autonomously",
    );
    expect(requestBody.messages[0].content).not.toContain(
      "You may escalate beyond it",
    );
    const projected = JSON.parse(requestBody.messages[1].content);
    expect(projected).toMatchObject({
      allowed_candidate_ids: [candidateId],
      evidence_floor: "low",
      required_project_advisory: {
        risk_level: "low",
        danger_basis: "none",
      },
      required_counts:
        tavernKeeperAssessmentRequirements(report).required_counts,
      repair,
    });
    expect(projected.assessments[0]).toMatchObject({
      risk_exposure: "not_demonstrated",
    });
    expect(projected.observations[0]).not.toHaveProperty("observation_id");
    expect(JSON.stringify(projected)).not.toContain("secret");
  });

  test("retries invalid structured output and returns a bound final projection", async () => {
    const report = await fixture();
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        output: lowOutput({ cited_finding_ids: ["f".repeat(64)] }),
        metadata: { requestedModel: "gpt-5.6-luna" },
      })
      .mockResolvedValueOnce({
        output: lowOutput(),
        metadata: { requestedModel: "gpt-5.6-luna" },
      });

    const result = await synthesizeTavernKeeperReport(report, {
      provider: { generate },
      now: () => new Date("2026-08-02T12:06:00.000Z"),
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].repair).toMatchObject({
      diagnostic: "unknown_candidate_ids",
      rejected_candidate_ids: ["f".repeat(64)],
      allowed_candidate_ids: [],
    });
    expect(result).toMatchObject({
      report_id: report.report_id,
      target_sha: report.target_sha,
      synthesis_model: "gpt-5.6-luna",
      assessed_at: "2026-08-02T12:06:00.000Z",
      assessment: { risk_level: "low" },
      synthesis_policy_version: "5",
    });
    expect(TAVERNKEEPER_SYNTHESIS_POLICY_VERSION).toBe("5");
  });

  test("binds policy-required citations before validating model output", async () => {
    const report = {
      ...(await fixture()),
      ...reportWith([assessment({ disposition: "minor_weakness" })]),
    };
    const generate = vi.fn().mockResolvedValue({
      output: lowOutput({ minor_cautions: 1 }),
      metadata: { requestedModel: "gpt-5.6-luna" },
    });

    const result = await synthesizeTavernKeeperReport(report, {
      provider: { generate },
      now: () => new Date("2026-08-02T12:06:00.000Z"),
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.assessment.cited_finding_ids).toEqual([candidateId]);
  });

  test("repairs public prose that leaks structured finding IDs", async () => {
    const report = await fixture();
    const leakedSummary = "The extension is low risk [" + "f".repeat(64) + "].";
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        output: lowOutput({ summary: leakedSummary }),
        metadata: { requestedModel: "gpt-5.6-luna" },
      })
      .mockResolvedValueOnce({
        output: lowOutput({ summary: "The extension is low risk." }),
        metadata: { requestedModel: "gpt-5.6-luna" },
      });

    const result = await synthesizeTavernKeeperReport(report, {
      provider: { generate },
      now: () => new Date("2026-08-02T12:06:00.000Z"),
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].repair).toMatchObject({
      diagnostic: "public_text_references",
      allowed_candidate_ids: [],
    });
    expect(result.assessment.summary).toBe("The extension is low risk.");
  });

  test("stops before sending an identical validation repair", async () => {
    const report = await fixture();
    const generate = vi.fn().mockResolvedValue({
      output: lowOutput({ cited_finding_ids: ["f".repeat(64)] }),
      metadata: { requestedModel: "gpt-5.6-luna" },
    });

    await expect(
      synthesizeTavernKeeperReport(report, {
        provider: { generate },
        now: () => new Date("2026-08-02T12:06:00.000Z"),
      }),
    ).rejects.toMatchObject({ kind: "invalid-output" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  test("preserves a typed terminal invalid-output failure", async () => {
    const report = await fixture();
    const generatedSecret = "REJECTED GENERATED PROSE";
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        output: lowOutput({ cited_finding_ids: ["f".repeat(64)] }),
        metadata: { requestedModel: "gpt-5.6-luna" },
      })
      .mockResolvedValueOnce({
        output: lowOutput({ minor_cautions: 1 }),
        metadata: { requestedModel: "gpt-5.6-luna" },
      })
      .mockResolvedValueOnce({
        output: lowOutput({ summary: `<${generatedSecret}>` }),
        metadata: { requestedModel: "gpt-5.6-luna" },
      });

    const error = await synthesizeTavernKeeperReport(report, {
      provider: { generate },
    }).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(TavernKeeperSynthesisError);
    expect(error).toMatchObject({
      kind: "invalid-output",
      diagnostic: "response_schema",
    });
    expect(JSON.stringify(error)).not.toContain(generatedSecret);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  test("treats invalid provider structured content as bounded invalid output", async () => {
    const report = await fixture();
    const generate = vi
      .fn()
      .mockRejectedValue(
        new EnrichmentProviderError(
          "provider-response-invalid",
          "content-json-invalid",
        ),
      );

    await expect(
      synthesizeTavernKeeperReport(report, { provider: { generate } }),
    ).rejects.toMatchObject({
      kind: "invalid-output",
      diagnostic: "provider_response_invalid",
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].repair).toMatchObject({
      diagnostic: "provider_response_invalid",
    });
  });

  test.each([
    ["provider-timeout", "provider-transient"],
    ["provider-rate-limited", "provider-transient"],
    ["provider-server-error", "provider-transient"],
    ["provider-network-error", "provider-transient"],
    ["provider-authentication-failed", "provider-security"],
    ["provider-request-failed", "provider-security"],
    ["provider-model-mismatch", "provider-security"],
  ] as const)(
    "classifies %s as %s without report-local retry",
    async (code, kind) => {
      const report = await fixture();
      const generate = vi
        .fn()
        .mockRejectedValue(new EnrichmentProviderError(code));

      await expect(
        synthesizeTavernKeeperReport(report, { provider: { generate } }),
      ).rejects.toMatchObject({ kind, diagnostic: code });
      expect(generate).toHaveBeenCalledTimes(1);
    },
  );
});
