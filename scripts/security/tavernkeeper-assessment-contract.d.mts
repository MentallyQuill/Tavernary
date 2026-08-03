import type {
  TavernKeeperContextualItemV5,
  TavernKeeperRiskLevel,
  TavernaryAssessmentV1,
} from "./tavernkeeper-reports.mjs";

export const TAVERNKEEPER_SYNTHESIS_POLICY_VERSION: "1";
export const TAVERNKEEPER_ASSESSMENT_JSON_SCHEMA: Record<string, unknown>;
export function validateStoredAssessmentShape(
  assessment: unknown,
): TavernaryAssessmentV1;
export function deriveEvidenceFloor(
  assessments: readonly TavernKeeperContextualItemV5[],
): TavernKeeperRiskLevel;
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
