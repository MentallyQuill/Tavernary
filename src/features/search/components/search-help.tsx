"use client";

import { useEffect, useId, useRef, useState } from "react";

import { SearchHelpIcon } from "@/components/icons/search-help-icon";

export function SearchHelp() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const generatedId = useId();
  const panelId = `${generatedId}-search-help`;
  const headingId = `${panelId}-heading`;

  useEffect(() => {
    if (!open) return;

    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  return (
    <span className="search-help" ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label="Search help"
        className="search-help-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <SearchHelpIcon />
      </button>
      {open ? (
        <section
          aria-labelledby={headingId}
          className="search-help-popover"
          id={panelId}
          role="dialog"
        >
          <h2 id={headingId}>Search basics</h2>
          <ul>
            <li>
              <code>A B</code>
              <span>— matches results containing A and B.</span>
            </li>
            <li>
              <code>A+B</code>
              <span>— matches results containing A or B.</span>
            </li>
            <li>
              <code>A+B C</code>
              <span>— matches A, or both B and C.</span>
            </li>
          </ul>
          <p>Search-result URLs can be copied and shared.</p>
          <p>
            Press <kbd>/</kbd> anywhere on the page to jump to search.
          </p>
        </section>
      ) : null}
    </span>
  );
}
