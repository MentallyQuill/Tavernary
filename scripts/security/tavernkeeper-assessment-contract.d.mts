import type {
  TavernKeeperContextualItemV5,
  TavernKeeperRiskLevel,
  TavernaryAssessmentV1,
} from "./tavernkeeper-reports.mjs";

export const TAVERNKEEPER_SYNTHESIS_POLICY_VERSION: "4";
export const TAVERNKEEPER_ASSESSMENT_JSON_SCHEMA: Record<string, unknown>;
export type TavernaryAssessmentDiagnostic =
  | "response_schema"
  | "public_text_references"
  | "unknown_candidate_ids"
  | "missing_candidate_ids"
  | "count_mismatch"
  | "interaction_chain_ids"
  | "below_evidence_floor"
  | "unsupported_escalation";
export interface TavernaryAssessmentRepair {
  rejected_candidate_ids?: string[];
  required_candidate_ids?: string[];
  rejected_risk_level?: TavernKeeperRiskLevel;
  required_risk_level?: TavernKeeperRiskLevel;
  allowed_candidate_ids: string[];
  evidence_floor: TavernKeeperRiskLevel;
  required_counts: {
    minor_cautions: number;
    material_concerns: number;
    high_danger: number;
  };
}
export class TavernaryAssessmentValidationError extends Error {
  constructor(
    diagnostic: TavernaryAssessmentDiagnostic,
    repair: TavernaryAssessmentRepair,
  );
  diagnostic: TavernaryAssessmentDiagnostic;
  repair: TavernaryAssessmentRepair;
}
export function validateStoredAssessmentShape(
  assessment: unknown,
): TavernaryAssessmentV1;
export function deriveEvidenceFloor(
  assessments: readonly TavernKeeperContextualItemV5[],
): TavernKeeperRiskLevel;
export type TavernKeeperDangerBasis =
  | "none"
  | "malicious_or_compromised"
  | "critical_exploitable_vulnerability"
  | "mixed";
export function deriveProjectAdvisory(
  assessments: readonly TavernKeeperContextualItemV5[],
): {
  risk_level: TavernKeeperRiskLevel;
  danger_basis: TavernKeeperDangerBasis;
};
export function buildDeterministicAssessment(report: {
  candidates: Array<{ candidate_id: string }>;
  assessments: TavernKeeperContextualItemV5[];
  observations: Array<
    Omit<TavernKeeperContextualItemV5, "candidate_id"> & {
      related_candidate_ids: string[];
    }
  >;
}): TavernaryAssessmentV1;
export function tavernKeeperAssessmentRequirements(report: {
  candidates: Array<{ candidate_id: string }>;
  assessments: TavernKeeperContextualItemV5[];
  observations: Array<
    Omit<TavernKeeperContextualItemV5, "candidate_id"> & {
      related_candidate_ids: string[];
    }
  >;
}): {
  allowed_candidate_ids: string[];
  required_candidate_ids: string[];
  evidence_floor: TavernKeeperRiskLevel;
  required_counts: {
    minor_cautions: number;
    material_concerns: number;
    high_danger: number;
  };
};
export function validateTavernaryAssessment(
  assessment: unknown,
  report: {
    candidates: Array<{ candidate_id: string }>;
    assessments: TavernKeeperContextualItemV5[];
    observations: Array<
      Omit<TavernKeeperContextualItemV5, "candidate_id"> & {
        related_candidate_ids: string[];
      }
    >;
  },
): TavernaryAssessmentV1;
