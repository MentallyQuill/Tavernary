"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useModalSurface({
  active,
  containerRef,
  initialFocusRef,
  onDismiss,
  inertSelectors,
}: {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  inertSelectors: readonly string[];
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!active) return;

    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const inerted = inertSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
        (element) => {
          if (element.hasAttribute("inert")) return false;
          element.setAttribute("inert", "");
          return true;
        },
      ),
    );

    document.body.classList.add("sheet-open");
    initialFocusRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismissRef.current();
        return;
      }
      if (event.key !== "Tab" || !containerRef.current) return;

      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === initialFocusRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      inerted.forEach((element) => element.removeAttribute("inert"));
      document.body.classList.remove("sheet-open");
      window.setTimeout(() => {
        if (opener?.isConnected && opener.getClientRects().length > 0) {
          opener.focus();
        }
      }, 0);
    };
  }, [active, containerRef, inertSelectors, initialFocusRef]);
}
