"use client";

import {
  SubmissionReview,
  type SubmissionReviewProps,
  type SubmissionReviewRow,
} from "@/features/submissions/components/submission-review";

export type HelpReviewRow = SubmissionReviewRow;

type HelpReviewProps = Omit<
  SubmissionReviewProps,
  "title" | "introduction" | "className"
>;

export function HelpReview(props: HelpReviewProps) {
  return (
    <SubmissionReview
      {...props}
      title="Review your public request"
      introduction={
        <p>
          These details will be public on GitHub. Do not include secrets or
          private personal information.
        </p>
      }
      className="help-review"
    />
  );
}
