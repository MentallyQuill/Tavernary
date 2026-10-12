"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

type Position = { left: number; top: number };

export function isPositionAnchorHidden(element: HTMLElement) {
  if (
    !element.isConnected ||
    element.closest("[hidden], [inert], [aria-hidden='true']")
  )
    return true;
  if (typeof element.checkVisibility === "function") {
    return !element.checkVisibility({
      visibilityProperty: true,
      contentVisibilityAuto: true,
    });
  }
  for (
    let ancestor: HTMLElement | null = element;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const style = window.getComputedStyle(ancestor);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    )
      return true;
  }
  return false;
}

export function usePositionState() {
  const [position, setPosition] = useState<Position | null>(null);
  const current = useRef<Position | null>(null);
  const update = useCallback((next: Position | null) => {
    if (
      current.current?.left === next?.left &&
      current.current?.top === next?.top
    )
      return;
    current.current = next;
    setPosition(next);
  }, []);
  return [position, update] as const;
}

/** Position immediately on open, then measure at most once per browser frame. */
export function useFramePositioning(
  open: boolean,
  updatePosition: () => void,
  includeVisualViewport = false,
) {
  useLayoutEffect(() => {
    if (!open) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updatePosition();
      });
    };
    const viewport = includeVisualViewport ? window.visualViewport : null;
    updatePosition();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, [includeVisualViewport, open, updatePosition]);
}
