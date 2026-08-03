import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test, vi } from "vitest";

import {
  deriveEvidenceFloor,
  validateTavernaryAssessment,
} from "../../scripts/security/tavernkeeper-assessment-contract.mjs";
import { createTavernKeeperSynthesisProvider } from "../../scripts/security/tavernkeeper-synthesis-provider.mjs";
import { synthesizeTavernKeeperReport } from "../../scripts/security/tavernkeeper-synthesis.mjs";
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

function reportWith(items: TavernKeeperContextualItemV5[]) {
  return {
    report_id: "d".repeat(64),
    target_sha: "a".repeat(40),
    repository: "owner/repo",
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

  test("raises medium-confidence material vulnerabilities to material", () => {
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
    ).toBe("material");
  });

  test("keeps expected behavior, minor weaknesses, and low-confidence material evidence low", () => {
    expect(
      deriveEvidenceFloor([
        assessment(),
        assessment({
          candidate_id: "e".repeat(64),
          disposition: "minor_weakness",
        }),
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

  test("rejects unknown finding citations", () => {
    expect(() =>
      validateTavernaryAssessment(
        lowOutput({ cited_finding_ids: ["f".repeat(64)] }),
        reportWith([]),
      ),
    ).toThrow(/unknown finding/u);
  });

  test("rejects unsafe public prose", () => {
    expect(() =>
      validateTavernaryAssessment(
        lowOutput({ summary: "<script>alert(1)</script>" }),
        reportWith([]),
      ),
    ).toThrow(/unsafe/u);
  });

  test("rejects caution counts that do not match the V5 items", () => {
    expect(() =>
      validateTavernaryAssessment(
        lowOutput({ cited_finding_ids: [candidateId] }),
        reportWith([assessment({ disposition: "minor_weakness" })]),
      ),
    ).toThrow(/count/u);
  });

  test("rejects a grade below the deterministic evidence floor", () => {
    const report = reportWith([
      assessment({
        disposition: "material_vulnerability",
        confidence: "medium",
        recommended_risk: "material",
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
    expect(() =>
      validateTavernaryAssessment(
        lowOutput({ risk_level: "material" }),
        reportWith([]),
      ),
    ).toThrow(/interaction chain/u);
  });

  test("accepts a supported causal interaction that escalates risk", () => {
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

    expect(validateTavernaryAssessment(output, report)).toEqual(output);
  });
});

describe("strict Luna synthesis", () => {
  test("uses the shared provider transport with Tavernary's strict schema", async () => {
    const report = await fixture();
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

    await provider.generate({ report });

    expect(requestBody).not.toHaveProperty("temperature");
    expect(requestBody.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "tavernary_tavernkeeper_assessment_v1",
        strict: true,
      },
    });
    expect(requestBody.messages[0].content).toContain(
      "synthesizing validated assessments, not rescanning code",
    );
    expect(requestBody.messages[0].content).toContain("cite V5 finding IDs");
    expect(requestBody.messages[1].content).not.toContain("secret");
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
    expect(generate.mock.calls[1][0].repair).toMatch(/unknown finding/u);
    expect(result).toMatchObject({
      report_id: report.report_id,
      target_sha: report.target_sha,
      synthesis_model: "gpt-5.6-luna",
      assessed_at: "2026-08-02T12:06:00.000Z",
      assessment: { risk_level: "low" },
    });
  });

  test("fails without a degraded projection after three invalid responses", async () => {
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
    ).rejects.toThrow(/three attempts/u);
    expect(generate).toHaveBeenCalledTimes(3);
  });
});
