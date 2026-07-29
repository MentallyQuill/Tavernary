"use client";

import { useId, useRef, useState } from "react";

import { useModalSurface } from "@/hooks/use-modal-surface";

const noInertSelectors: readonly string[] = [];

export function PermanentDelistDialog({
  repository,
  cards,
  onCancel,
  onConfirm,
}: {
  repository: string;
  cards: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onConfirm: (confirmation: string) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const effectId = useId();
  const matches =
    confirmation.trim().toLocaleLowerCase() === repository.toLocaleLowerCase();

  useModalSurface({
    active: true,
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onDismiss: onCancel,
    inertSelectors: noInertSelectors,
  });

  return (
    <div
      className="permanent-delist-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="permanent-delist-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${effectId}`}
      >
        <h2 id={titleId}>Permanently delist {repository}?</h2>
        <p id={descriptionId}>
          This is a permanent repository-wide action. It hides every Tavernary
          card from this source and prevents the repository from being added
          again.
        </p>
        <p id={effectId}>
          Adding, editing, retiring, and restoring individual cards are normal
          maintenance. Delisting the source is not reversible.
        </p>
        <p>Affected cards:</p>
        <ul className="permanent-delist-cards">
          {cards.map((card) => (
            <li key={card.id}>{card.name}</li>
          ))}
        </ul>

        <label htmlFor="permanent-delist-repository">
          Type {repository} to confirm permanent delisting.
        </label>
        <input
          id="permanent-delist-repository"
          value={confirmation}
          autoComplete="off"
          onChange={(event) => setConfirmation(event.target.value)}
        />
        {matches ? (
          <p
            className="permanent-delist-match"
            role="status"
            aria-live="polite"
          >
            Repository matches. Permanent delisting is now available.
          </p>
        ) : null}

        <div className="permanent-delist-actions">
          <button
            ref={cancelRef}
            type="button"
            className="control-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="permanent-delist-confirm"
            disabled={!matches}
            onClick={() => onConfirm(confirmation)}
          >
            Permanently delist source
          </button>
        </div>
      </div>
    </div>
  );
}
