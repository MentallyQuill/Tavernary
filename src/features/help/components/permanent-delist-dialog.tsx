"use client";

import { useId, useRef, useState } from "react";

import { useModalSurface } from "@/hooks/use-modal-surface";

const noInertSelectors: readonly string[] = [];

export function PermanentDelistDialog({
  projectName,
  repositoryLabel,
  onCancel,
  onConfirm,
}: {
  projectName: string;
  repositoryLabel: string;
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
    confirmation.trim().toLocaleLowerCase() === projectName.toLocaleLowerCase();

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
        <h2 id={titleId}>Permanently delist {projectName}?</h2>
        <p id={descriptionId}>
          You are about to remove {projectName} from Tavernary. This delisting
          applies to {repositoryLabel}.
        </p>
        <p id={effectId}>
          The project will be removed from the public catalog. You will not be
          able to reverse this decision or resubmit the project. Kits containing
          this project may also be affected.
        </p>

        <label htmlFor="permanent-delist-project-name">
          Type {projectName} to confirm permanent delisting.
        </label>
        <input
          id="permanent-delist-project-name"
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
            Project name matches. Permanent delisting is now available.
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
            Permanently delist project
          </button>
        </div>
      </div>
    </div>
  );
}
