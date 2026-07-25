"use client";

import { useEffect, useId, useRef } from "react";

export function KitDiscardDialog({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepEditingRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onKeepEditing();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const buttons = Array.from(
        dialogRef.current.querySelectorAll<HTMLButtonElement>("button"),
      );
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [onKeepEditing]);

  return (
    <div
      className="kit-discard-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onKeepEditing();
      }}
    >
      <div
        ref={dialogRef}
        className="kit-discard-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId}>Discard unfinished Kit?</h2>
        <p id={descriptionId}>
          This removes your saved draft and cannot be undone.
        </p>
        <div className="kit-discard-actions">
          <button
            ref={keepEditingRef}
            type="button"
            className="control-secondary"
            onClick={onKeepEditing}
          >
            Keep editing
          </button>
          <button
            type="button"
            className="control-primary kit-discard-confirm"
            onClick={onDiscard}
          >
            Discard Kit
          </button>
        </div>
      </div>
    </div>
  );
}
