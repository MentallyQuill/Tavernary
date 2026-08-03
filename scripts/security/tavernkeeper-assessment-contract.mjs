export const TAVERNKEEPER_SYNTHESIS_POLICY_VERSION = "1";

const riskLevels = ["low", "material", "high"];
const digestPattern = /^[0-9a-f]{64}$/u;
const unsafeTextPattern =
  /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/u;

export const TAVERNKEEPER_ASSESSMENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "risk_level",
    "headline",
    "summary",
    "minor_cautions",
    "material_concerns",
    "high_danger",
    "malicious_evidence",
    "cited_finding_ids",
    "interaction_chains",
  ],
  properties: {
    risk_level: { type: "string", enum: riskLevels },
    headline: { type: "string", minLength: 1, maxLength: 100 },
    summary: { type: "string", minLength: 1, maxLength: 500 },
    minor_cautions: { type: "integer", minimum: 0 },
    material_concerns: { type: "integer", minimum: 0 },
    high_danger: { type: "integer", minimum: 0 },
    malicious_evidence: { type: "string", minLength: 1, maxLength: 300 },
    cited_finding_ids: {
      type: "array",
      maxItems: 256,
      items: { type: "string", pattern: "^[0-9a-f]{64}$" },
    },
    interaction_chains: {
      type: "array",
      maxItems: 64,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["finding_ids", "resulting_risk", "explanation"],
        properties: {
          finding_ids: {
            type: "array",
            minItems: 2,
            maxItems: 16,
            items: { type: "string", pattern: "^[0-9a-f]{64}$" },
          },
          resulting_risk: {
            type: "string",
            enum: ["material", "high"],
          },
          explanation: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
  },
};

function exactKeys(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} has an invalid shape`);
  }
}

function safeText(value, maximum, label) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value ||
    unsafeTextPattern.test(value)
  ) {
    throw new Error(`${label} contains unsafe public text`);
  }
}

function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} count is invalid`);
  }
}

function validateIds(value, { minimum = 0, maximum = 256 } = {}) {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= maximum &&
    new Set(value).size === value.length &&
    value.every((id) => typeof id === "string" && digestPattern.test(id))
  );
}

const assessmentKeys = [
  "risk_level",
  "headline",
  "summary",
  "minor_cautions",
  "material_concerns",
  "high_danger",
  "malicious_evidence",
  "cited_finding_ids",
  "interaction_chains",
];

export function validateStoredAssessmentShape(assessment) {
  exactKeys(assessment, assessmentKeys, "Tavernary assessment");
  if (!riskLevels.includes(assessment.risk_level)) {
    throw new Error("Tavernary assessment risk level is invalid");
  }
  safeText(assessment.headline, 100, "Tavernary assessment headline");
  safeText(assessment.summary, 500, "Tavernary assessment summary");
  safeText(
    assessment.malicious_evidence,
    300,
    "Tavernary malicious-evidence statement",
  );
  nonnegativeInteger(assessment.minor_cautions, "Minor caution");
  nonnegativeInteger(assessment.material_concerns, "Material concern");
  nonnegativeInteger(assessment.high_danger, "High danger");
  if (!validateIds(assessment.cited_finding_ids)) {
    throw new Error("Tavernary assessment finding citations are invalid");
  }
  if (
    !Array.isArray(assessment.interaction_chains) ||
    assessment.interaction_chains.length > 64
  ) {
    throw new Error("Tavernary assessment interaction chains are invalid");
  }
  for (const chain of assessment.interaction_chains) {
    exactKeys(
      chain,
      ["finding_ids", "resulting_risk", "explanation"],
      "Tavernary assessment interaction chain",
    );
    if (
      !validateIds(chain.finding_ids, { minimum: 2, maximum: 16 }) ||
      !["material", "high"].includes(chain.resulting_risk)
    ) {
      throw new Error("Tavernary assessment interaction chain is invalid");
    }
    safeText(
      chain.explanation,
      500,
      "Tavernary assessment interaction-chain explanation",
    );
  }
  return assessment;
}

function isHighFloor(item) {
  return (
    item.confidence === "high" &&
    (item.disposition === "credible_malicious_behavior" ||
      (item.disposition === "material_vulnerability" &&
        item.impact === "critical" &&
        item.exploitability === "readily_exploitable"))
  );
}

function isMaterialFloor(item) {
  return (
    item.disposition === "material_vulnerability" &&
    ["medium", "high"].includes(item.confidence)
  );
}

export function deriveEvidenceFloor(assessments) {
  if (!Array.isArray(assessments)) {
    throw new Error(
      "TavernKeeper assessments are required for evidence floors",
    );
  }
  if (assessments.some(isHighFloor)) return "high";
  if (assessments.some(isMaterialFloor)) return "material";
  return "low";
}

function reportItems(report) {
  return [...(report.assessments ?? []), ...(report.observations ?? [])];
}

function expectedCounts(report) {
  const items = reportItems(report);
  return {
    minor_cautions: items.filter(
      (item) => item.disposition === "minor_weakness",
    ).length,
    material_concerns: items.filter(
      (item) => item.recommended_risk === "material",
    ).length,
    high_danger: items.filter((item) => item.recommended_risk === "high")
      .length,
  };
}

function knownCandidateIds(report) {
  return new Set((report.candidates ?? []).map((item) => item.candidate_id));
}

function requiredCitations(report) {
  const required = new Set();
  for (const item of report.assessments ?? []) {
    if (item.disposition !== "expected_behavior")
      required.add(item.candidate_id);
  }
  for (const item of report.observations ?? []) {
    if (item.disposition !== "expected_behavior") {
      for (const id of item.related_candidate_ids) required.add(id);
    }
  }
  return required;
}

export function validateTavernaryAssessment(assessment, report) {
  validateStoredAssessmentShape(assessment);
  const known = knownCandidateIds(report);
  const cited = new Set(assessment.cited_finding_ids);
  if ([...cited].some((id) => !known.has(id))) {
    throw new Error("Tavernary assessment cites an unknown finding");
  }
  const required = requiredCitations(report);
  if ([...required].some((id) => !cited.has(id))) {
    throw new Error("Tavernary assessment omits a finding citation");
  }
  const counts = expectedCounts(report);
  if (
    assessment.minor_cautions !== counts.minor_cautions ||
    assessment.material_concerns !== counts.material_concerns ||
    assessment.high_danger !== counts.high_danger
  ) {
    throw new Error("Tavernary assessment count does not match V5 items");
  }
  for (const chain of assessment.interaction_chains) {
    if (chain.finding_ids.some((id) => !known.has(id) || !cited.has(id))) {
      throw new Error("Tavernary interaction chain cites an unknown finding");
    }
  }
  const floor = deriveEvidenceFloor(reportItems(report));
  const floorRank = riskLevels.indexOf(floor);
  const riskRank = riskLevels.indexOf(assessment.risk_level);
  if (riskRank < floorRank) {
    throw new Error("Tavernary assessment grade is below the evidence floor");
  }
  if (
    riskRank > floorRank &&
    !assessment.interaction_chains.some(
      (chain) => chain.resulting_risk === assessment.risk_level,
    )
  ) {
    throw new Error(
      "Tavernary assessment escalation requires a cited interaction chain",
    );
  }
  return assessment;
}
