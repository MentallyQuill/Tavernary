import { describe, expect, test } from "vitest";

import primaryFunctionVocabulary from "../../data/vocabularies/primary-functions.json";
import {
  classificationReviewLabel,
  classificationReviewMarker,
  planClassificationReviewNotice,
} from "../../scripts/submissions/classification-review-notice.mjs";

const mismatch = {
  status: "possible-mismatch" as const,
  submitted_primary_function: "memory-retrieval",
  suggested_primary_function: "interface-workflow",
  explanation: "The source primarily describes user-facing editing controls.",
};

describe("classification review issue notice", () => {
  test("uses the checked-in labels for every Extension category", () => {
    const labels = new Map(
      primaryFunctionVocabulary.primary_functions.map(({ id, label }) => [
        id,
        label,
      ]),
    );
    for (const id of [
      "memory-retrieval",
      "generation-reasoning",
      "character-worldbuilding",
      "rpg-systems",
      "interface-workflow",
      "developer-infrastructure",
    ]) {
      const plan = planClassificationReviewNotice({
        classificationReview: {
          ...mismatch,
          submitted_primary_function: id,
          suggested_primary_function:
            id === "interface-workflow"
              ? "memory-retrieval"
              : "interface-workflow",
        },
        currentLabels: [],
        comments: [],
      });
      expect(plan.comment?.body).toContain(labels.get(id));
    }
  });

  test("creates one owned comment and adds the label for a mismatch", () => {
    const plan = planClassificationReviewNotice({
      classificationReview: mismatch,
      currentLabels: ["project-submission"],
      comments: [],
    });

    expect(plan.addLabels).toEqual([classificationReviewLabel]);
    expect(plan.removeLabels).toEqual([]);
    expect(plan.comment).toMatchObject({ action: "create" });
    expect(plan.comment?.body).toContain(classificationReviewMarker);
    expect(plan.comment?.body).toContain("Memory and retrieval");
    expect(plan.comment?.body).toContain("Interface and workflow");
    expect(plan.removeCommentIds).toEqual([]);
  });

  test("updates the first marker comment and removes duplicate owned comments", () => {
    const plan = planClassificationReviewNotice({
      classificationReview: mismatch,
      currentLabels: [classificationReviewLabel],
      comments: [
        { id: 22, body: `${classificationReviewMarker}\nstale` },
        { id: 23, body: `${classificationReviewMarker}\nduplicate` },
      ],
    });

    expect(plan.addLabels).toEqual([]);
    expect(plan.comment).toMatchObject({ action: "update", commentId: 22 });
    expect(plan.removeCommentIds).toEqual([23]);
  });

  test("is a no-op when the exact mismatch notice already exists", () => {
    const initial = planClassificationReviewNotice({
      classificationReview: mismatch,
      currentLabels: [],
      comments: [],
    });
    const body = initial.comment?.body;
    expect(body).toEqual(expect.any(String));

    expect(
      planClassificationReviewNotice({
        classificationReview: mismatch,
        currentLabels: [classificationReviewLabel],
        comments: [{ id: 22, body }],
      }),
    ).toEqual({
      addLabels: [],
      removeLabels: [],
      comment: null,
      removeCommentIds: [],
    });
  });

  test.each([
    {
      status: "confirmed" as const,
      submitted_primary_function: "memory-retrieval",
      suggested_primary_function: "memory-retrieval",
      explanation: null,
    },
    {
      status: "classification-check-unavailable" as const,
      submitted_primary_function: "memory-retrieval",
      suggested_primary_function: null,
      explanation: "The optional classification check was unavailable.",
    },
  ])("removes stale owned state for $status", (classificationReview) => {
    expect(
      planClassificationReviewNotice({
        classificationReview,
        currentLabels: [classificationReviewLabel, "project-submission"],
        comments: [
          { id: 22, body: `${classificationReviewMarker}\nstale` },
          { id: 23, body: `${classificationReviewMarker}\nduplicate` },
        ],
      }),
    ).toEqual({
      addLabels: [],
      removeLabels: [classificationReviewLabel],
      comment: null,
      removeCommentIds: [22, 23],
    });
  });

  test("bounds and sanitizes rendered mismatch values", () => {
    const plan = planClassificationReviewNotice({
      classificationReview: {
        ...mismatch,
        explanation: `**unsafe** <script>alert(1)</script> ${"long ".repeat(100)}`,
      },
      currentLabels: [],
      comments: [],
    });
    const body = plan.comment?.body ?? "";

    expect(body).not.toContain("<script>");
    expect(body).not.toContain("**unsafe**");
    expect(body.length).toBeLessThan(1_200);
  });
});
