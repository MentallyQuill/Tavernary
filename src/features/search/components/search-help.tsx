"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { SearchHelpIcon } from "@/components/icons/search-help-icon";
import {
  isPositionAnchorHidden,
  useFramePositioning,
  usePositionState,
} from "@/hooks/use-frame-positioning";

const VIEWPORT_MARGIN = 8;
const POPOVER_GAP = 8;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function viewportBounds() {
  const viewport = window.visualViewport;
  return viewport
    ? {
        height: viewport.height,
        left: viewport.offsetLeft,
        top: viewport.offsetTop,
        width: viewport.width,
      }
    : { height: window.innerHeight, left: 0, top: 0, width: window.innerWidth };
}

function popoverPosition(trigger: DOMRect, popover: DOMRect) {
  const viewport = viewportBounds();
  const left = clamp(
    trigger.right - popover.width,
    viewport.left + VIEWPORT_MARGIN,
    viewport.left + viewport.width - popover.width - VIEWPORT_MARGIN,
  );
  const below = trigger.bottom + POPOVER_GAP;
  const top = clamp(
    below,
    viewport.top + VIEWPORT_MARGIN,
    viewport.top + viewport.height - popover.height - VIEWPORT_MARGIN,
  );

  return { left, top };
}

export function SearchHelp() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = usePositionState();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const generatedId = useId();
  const panelId = `${generatedId}-search-help`;
  const headingId = `${panelId}-heading`;

  const closePopover = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, [setPosition]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return;
    if (isPositionAnchorHidden(triggerRef.current)) {
      closePopover();
      return;
    }
    const next = popoverPosition(
      triggerRef.current.getBoundingClientRect(),
      popoverRef.current.getBoundingClientRect(),
    );
    setPosition(next);
  }, [closePopover, setPosition]);

  useFramePositioning(open, updatePosition, true);

  useEffect(() => {
    if (!open) return;

    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        closePopover();
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePopover();
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [closePopover, open]);

  return (
    <span className="search-help" ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label="Search help"
        className="search-help-trigger"
        onClick={() => {
          if (open) closePopover();
          else setOpen(true);
        }}
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
          ref={popoverRef}
          role="dialog"
          style={{
            ...position,
            visibility: position ? "visible" : "hidden",
          }}
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
