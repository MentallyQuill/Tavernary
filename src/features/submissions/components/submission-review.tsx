"use client";

import { useId, useState, type ReactNode } from "react";

import {
  GitHubHandoffError,
  type GitHubHandoffResult,
} from "@/features/submissions/github-handoff";

export interface SubmissionReviewRow {
  label: string;
  value: ReactNode;
}

export interface SubmissionReviewProps {
  rows: SubmissionReviewRow[];
  returnFocusId: string;
  onBack: () => void;
  onCancel: () => void;
  openReview: () => Promise<GitHubHandoffResult>;
  title?: string;
  introduction?: ReactNode;
  className?: string;
}

type HandoffState =
  | { phase: "idle" }
  | { phase: "opening" }
  | { phase: "opened"; mode: GitHubHandoffResult["mode"] }
  | { phase: "recovery"; message: string; url: string | null };

function openedMessage(mode: GitHubHandoffResult["mode"]) {
  return mode === "clipboard"
    ? "GitHub review opened in a new tab. Tavernary copied or displayed the complete manifest for you to paste unchanged."
    : "GitHub review opened in a new tab. Create the issue there, or return here to make changes.";
}

export function SubmissionReview({
  rows,
  returnFocusId,
  onBack,
  onCancel,
  openReview,
  title = "Review your request",
  introduction,
  className = "",
}: SubmissionReviewProps) {
  const headingId = useId();
  const [handoff, setHandoff] = useState<HandoffState>({ phase: "idle" });

  function returnToForm(callback: () => void) {
    callback();
    window.setTimeout(() => {
      document.getElementById(returnFocusId)?.focus();
    }, 0);
  }

  async function handleOpen() {
    setHandoff({ phase: "opening" });
    try {
      const result = await openReview();
      setHandoff({ phase: "opened", mode: result.mode });
    } catch (error) {
      setHandoff({
        phase: "recovery",
        message:
          error instanceof Error
            ? error.message
            : "GitHub review could not be opened.",
        url: error instanceof GitHubHandoffError ? error.url : null,
      });
    }
  }

  const classNames = ["submission-review", className].filter(Boolean).join(" ");

  return (
    <section className={classNames} aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {introduction}
      <dl className="submission-review-rows">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      {handoff.phase === "opening" ? (
        <p
          className="submission-review-status"
          role="status"
          aria-live="polite"
        >
          Taking you to GitHub...
        </p>
      ) : null}
      {handoff.phase === "opened" ? (
        <p
          className="submission-review-status"
          role="status"
          aria-live="polite"
        >
          {openedMessage(handoff.mode)}
        </p>
      ) : null}
      {handoff.phase === "recovery" ? (
        <div
          className="submission-review-recovery"
          role="alert"
          aria-live="assertive"
        >
          <p>{handoff.message}</p>
          {handoff.url ? (
            <a href={handoff.url} target="_blank" rel="noopener noreferrer">
              Open prepared GitHub review
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="submission-review-actions">
        <button
          type="button"
          className="submission-review-secondary"
          onClick={() => returnToForm(onBack)}
        >
          Back and edit
        </button>
        {handoff.phase === "idle" ||
        handoff.phase === "opening" ||
        handoff.phase === "recovery" ? (
          <button
            type="button"
            className="submission-review-cancel"
            onClick={() => returnToForm(onCancel)}
          >
            Cancel
          </button>
        ) : null}
        {handoff.phase === "idle" || handoff.phase === "opening" ? (
          <button
            type="button"
            className="submission-review-continue"
            onClick={() => void handleOpen()}
            disabled={handoff.phase === "opening"}
          >
            {handoff.phase === "opening"
              ? "Taking you to GitHub..."
              : "Continue on GitHub"}
          </button>
        ) : null}
        {handoff.phase === "opened" ? (
          <button
            type="button"
            className="submission-review-continue"
            onClick={() => void handleOpen()}
          >
            Open GitHub review again
          </button>
        ) : null}
      </div>
    </section>
  );
}
