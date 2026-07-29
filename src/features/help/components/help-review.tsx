"use client";

import type { ReactNode } from "react";

export interface HelpReviewRow {
  label: string;
  value: ReactNode;
}

export function HelpReview({
  rows,
  onBack,
  onCancel,
  onContinue,
  returnFocusId,
  continuing = false,
  fallbackUrl = "",
}: {
  rows: HelpReviewRow[];
  onBack: () => void;
  onCancel: () => void;
  onContinue: () => Promise<void>;
  returnFocusId: string;
  continuing?: boolean;
  fallbackUrl?: string;
}) {
  function returnToForm(callback: () => void) {
    callback();
    window.setTimeout(() => {
      document.getElementById(returnFocusId)?.focus();
    }, 0);
  }

  return (
    <section className="help-review" aria-labelledby="help-review-heading">
      <h2 id="help-review-heading">Review your public request</h2>
      <p>
        These details will be public on GitHub. Do not include secrets or
        private personal information.
      </p>
      {fallbackUrl ? (
        <p className="help-hint">
          <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
            Open the prepared GitHub form directly
          </a>
          .
        </p>
      ) : null}
      <dl className="help-review-rows">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="help-actions">
        <button
          type="button"
          className="help-secondary-action"
          onClick={() => returnToForm(onBack)}
        >
          Back and edit
        </button>
        <button
          type="button"
          className="help-link-action"
          onClick={() => returnToForm(onCancel)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="help-continue-action"
          onClick={() => void onContinue()}
          disabled={continuing}
        >
          {continuing ? "Opening GitHub…" : "Continue on GitHub"}
        </button>
      </div>
    </section>
  );
}
