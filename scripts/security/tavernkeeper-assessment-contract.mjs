export const TAVERNKEEPER_SYNTHESIS_POLICY_VERSION = "4";

const riskLevels = ["low", "material", "high"];
const digestPattern = /^[0-9a-f]{64}$/u;
const publicReferencePattern = /(?:\b[0-9a-f]{64}\b|\uE200cite\uE202|\uE201)/iu;
const unsafeTextPattern =
  /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/u;

export class TavernaryAssessmentValidationError extends Error {
  constructor(diagnostic, repair) {
    super(`Tavernary assessment failed ${diagnostic}`);
    this.name = "TavernaryAssessmentValidationError";
    this.diagnostic = diagnostic;
    this.repair = repair;
  }
}

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

function isMaterialFloor(item) {
  return item.disposition === "material_vulnerability";
}

export function deriveProjectAdvisory(assessments) {
  if (!Array.isArray(assessments)) {
    throw new Error(
      "TavernKeeper assessments are required for project advisory",
    );
  }
  const malicious = assessments.some(
    (item) =>
      item.disposition === "credible_malicious_behavior" &&
      item.confidence === "high",
  );
  const exploitable = assessments.some(
    (item) =>
      item.disposition === "material_vulnerability" &&
      item.confidence === "high" &&
      item.impact === "critical" &&
      item.exploitability === "readily_exploitable",
  );
  if (malicious || exploitable) {
    return {
      risk_level: "high",
      danger_basis:
        malicious && exploitable
          ? "mixed"
          : malicious
            ? "malicious_or_compromised"
            : "critical_exploitable_vulnerability",
    };
  }
  if (assessments.some(isMaterialFloor)) {
    return { risk_level: "material", danger_basis: "none" };
  }
  return { risk_level: "low", danger_basis: "none" };
}

export function deriveEvidenceFloor(assessments) {
  return deriveProjectAdvisory(assessments).risk_level;
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

export function tavernKeeperAssessmentRequirements(report) {
  const allowedCandidateIds = [...knownCandidateIds(report)].sort();
  if (!validateIds(allowedCandidateIds)) {
    throw new Error("TavernKeeper candidate identities are invalid");
  }
  const requiredCandidateIds = [...requiredCitations(report)].sort();
  if (
    !validateIds(requiredCandidateIds) ||
    requiredCandidateIds.some((id) => !allowedCandidateIds.includes(id))
  ) {
    throw new Error("TavernKeeper required citation identities are invalid");
  }
  return {
    allowed_candidate_ids: allowedCandidateIds,
    required_candidate_ids: requiredCandidateIds,
    required_counts: expectedCounts(report),
    evidence_floor: deriveEvidenceFloor(reportItems(report)),
  };
}

export function buildDeterministicAssessment(report) {
  const items = reportItems(report);
  const advisory = deriveProjectAdvisory(items);
  const requirements = tavernKeeperAssessmentRequirements(report);
  const counts = requirements.required_counts;
  const copy = {
    low: {
      headline: "Low concern",
      summary:
        "TavernKeeper did not identify a material security concern at the scanned commit. The detailed generated summary was unavailable; review the complete technical report for findings and limitations.",
      malicious_evidence:
        "No evidence of malicious behavior was identified in the completed review.",
    },
    material: {
      headline: "Material security concerns identified",
      summary:
        "TavernKeeper identified material security concerns at the scanned commit. The detailed generated summary was unavailable; review the complete technical report before installing or using this project.",
      malicious_evidence:
        "No high-confidence evidence of malicious or compromised behavior met the immediate-danger threshold.",
    },
    high: {
      headline: "Immediate danger identified",
      summary:
        "TavernKeeper identified immediate-danger evidence at the scanned commit. The detailed generated summary was unavailable; review the complete technical report before installing or using this project.",
      malicious_evidence:
        advisory.danger_basis === "malicious_or_compromised"
          ? "The report contains high-confidence evidence of credible malicious or compromised behavior."
          : advisory.danger_basis === "mixed"
            ? "The report contains high-confidence evidence of malicious or compromised behavior and a critical, readily exploitable vulnerability."
            : "No credible malicious behavior was identified; the immediate-danger result is based on a critical, readily exploitable vulnerability.",
    },
  }[advisory.risk_level];
  return validateStoredAssessmentShape({
    risk_level: advisory.risk_level,
    headline: copy.headline,
    summary: copy.summary,
    minor_cautions: counts.minor_cautions,
    material_concerns: counts.material_concerns,
    high_danger: counts.high_danger,
    malicious_evidence: copy.malicious_evidence,
    cited_finding_ids: requirements.required_candidate_ids,
    interaction_chains: [],
  });
}

function repairFor(requirements, extra = {}) {
  return {
    ...extra,
    allowed_candidate_ids: requirements.allowed_candidate_ids,
    required_candidate_ids: requirements.required_candidate_ids,
    required_counts: requirements.required_counts,
    evidence_floor: requirements.evidence_floor,
  };
}

function assessmentFailure(diagnostic, requirements, extra) {
  throw new TavernaryAssessmentValidationError(
    diagnostic,
    repairFor(requirements, extra),
  );
}

export function validateTavernaryAssessment(assessment, report) {
  const requirements = tavernKeeperAssessmentRequirements(report);
  try {
    validateStoredAssessmentShape(assessment);
  } catch {
    assessmentFailure("response_schema", requirements);
  }
  const publicText = [
    assessment.headline,
    assessment.summary,
    assessment.malicious_evidence,
    ...assessment.interaction_chains.map((chain) => chain.explanation),
  ];
  if (publicText.some((value) => publicReferencePattern.test(value))) {
    assessmentFailure("public_text_references", requirements);
  }
  const known = new Set(requirements.allowed_candidate_ids);
  const cited = new Set(assessment.cited_finding_ids);
  const rejectedCandidateIds = [...cited].filter((id) => !known.has(id)).sort();
  if (rejectedCandidateIds.length > 0) {
    assessmentFailure("unknown_candidate_ids", requirements, {
      rejected_candidate_ids: rejectedCandidateIds,
    });
  }
  const missingCandidateIds = requirements.required_candidate_ids.filter(
    (id) => !cited.has(id),
  );
  if (missingCandidateIds.length > 0) {
    assessmentFailure("missing_candidate_ids", requirements, {
      required_candidate_ids: missingCandidateIds,
    });
  }
  const counts = requirements.required_counts;
  if (
    assessment.minor_cautions !== counts.minor_cautions ||
    assessment.material_concerns !== counts.material_concerns ||
    assessment.high_danger !== counts.high_danger
  ) {
    assessmentFailure("count_mismatch", requirements);
  }
  for (const chain of assessment.interaction_chains) {
    const rejectedChainIds = chain.finding_ids
      .filter((id) => !known.has(id) || !cited.has(id))
      .sort();
    if (rejectedChainIds.length > 0) {
      assessmentFailure("interaction_chain_ids", requirements, {
        rejected_candidate_ids: rejectedChainIds,
      });
    }
  }
  const floor = requirements.evidence_floor;
  const floorRank = riskLevels.indexOf(floor);
  const riskRank = riskLevels.indexOf(assessment.risk_level);
  if (riskRank < floorRank) {
    assessmentFailure("below_evidence_floor", requirements);
  }
  if (riskRank > floorRank) {
    assessmentFailure("unsupported_escalation", requirements, {
      rejected_risk_level: assessment.risk_level,
      required_risk_level: floor,
    });
  }
  return assessment;
}
