"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const VIEWPORT_MARGIN = 8;
const TOOLTIP_GAP = 8;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function tooltipPosition(trigger: DOMRect, tooltip: DOMRect) {
  const left = clamp(
    trigger.left + trigger.width / 2 - tooltip.width / 2,
    VIEWPORT_MARGIN,
    window.innerWidth - tooltip.width - VIEWPORT_MARGIN,
  );
  const above = trigger.top - tooltip.height - TOOLTIP_GAP;
  const below = trigger.bottom + TOOLTIP_GAP;
  const preferredTop = above >= VIEWPORT_MARGIN ? above : below;
  const top = clamp(
    preferredTop,
    VIEWPORT_MARGIN,
    window.innerHeight - tooltip.height - VIEWPORT_MARGIN,
  );
  return { left, top };
}

export function Tooltip({
  id,
  label,
  children,
  className = "",
  style,
  showOnAncestorFocus = false,
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  showOnAncestorFocus?: boolean;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  const hide = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  const show = useCallback(() => {
    if (window.matchMedia("(max-width: 760px)").matches) return;
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!showOnAncestorFocus) return;
    const focusTarget = triggerRef.current?.closest("a, button");
    if (!focusTarget) return;

    focusTarget.addEventListener("focus", show);
    focusTarget.addEventListener("blur", hide);
    return () => {
      focusTarget.removeEventListener("focus", show);
      focusTarget.removeEventListener("blur", hide);
    };
  }, [hide, show, showOnAncestorFocus]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;
    setPosition(
      tooltipPosition(
        triggerRef.current.getBoundingClientRect(),
        tooltipRef.current.getBoundingClientRect(),
      ),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    const dismissOnMobile = (event: MediaQueryListEvent) => {
      if (event.matches) hide();
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    mobileQuery.addEventListener("change", dismissOnMobile);
    window.addEventListener("keydown", dismissOnEscape);
    return () => {
      mobileQuery.removeEventListener("change", dismissOnMobile);
      window.removeEventListener("keydown", dismissOnEscape);
    };
  }, [hide, open]);

  return (
    <>
      <span
        ref={triggerRef}
        className={`tooltip-anchor ${className}`}
        style={style}
        aria-describedby={id}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocusCapture={show}
        onBlurCapture={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            hide();
          }
        }}
      >
        {children}
      </span>
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={tooltipRef}
              className="tooltip-content tooltip-portal"
              id={id}
              role="tooltip"
              style={{
                ...position,
                visibility: position ? "visible" : "hidden",
              }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
