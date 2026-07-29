import type { GeneratedClassificationReview } from "./draft-project-record.mjs";

export const classificationReviewMarker: string;
export const classificationReviewLabel: "classification-review";

export type ClassificationReviewNoticePlan = {
  addLabels: string[];
  removeLabels: string[];
  comment:
    | { action: "create"; body: string }
    | { action: "update"; commentId: number; body: string }
    | null;
  removeCommentIds: number[];
};

export function primaryFunctionLabel(id: string): string;

export function planClassificationReviewNotice(input: {
  classificationReview: GeneratedClassificationReview | null;
  currentLabels: string[];
  comments: Array<{ id: number; body?: string | null }>;
}): ClassificationReviewNoticePlan;
