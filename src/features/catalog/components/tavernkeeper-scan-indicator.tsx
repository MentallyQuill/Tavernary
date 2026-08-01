"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { TavernKeeperScanIcon } from "@/components/icons/tavernkeeper-scan-icon";
import type { TavernKeeperCardStatus } from "@/features/catalog/tavernkeeper-status";

const stateCopy = {
  green: "No review-level findings",
  yellow: "Review suggested",
  pending: "Current scan pending",
  outdated: "Previous result does not cover this commit",
  "source-unavailable": "Current source state unavailable",
} as const;

const severityLabels = [
  ["critical", "critical"],
  ["high", "high"],
  ["medium", "medium"],
  ["low", "low"],
  ["info", "informational"],
] as const;

const CLOSE_DELAY = 150;
const VIEWPORT_MARGIN = 8;
const POPOVER_GAP = 8;

let activeDismiss: (() => void) | null = null;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function popoverPosition(trigger: DOMRect, popover: DOMRect) {
  const left = clamp(
    trigger.left + trigger.width / 2 - popover.width / 2,
    VIEWPORT_MARGIN,
    window.innerWidth - popover.width - VIEWPORT_MARGIN,
  );
  const above = trigger.top - popover.height - POPOVER_GAP;
  const below = trigger.bottom + POPOVER_GAP;
  const top = clamp(
    above >= VIEWPORT_MARGIN ? above : below,
    VIEWPORT_MARGIN,
    window.innerHeight - popover.height - VIEWPORT_MARGIN,
  );

  return { left, top };
}

function formatDate(scannedAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(scannedAt));
}

export function TavernKeeperScanIndicator({
  projectId,
  status,
}: {
  projectId: string;
  status: TavernKeeperCardStatus;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const reportLinkRef = useRef<HTMLAnchorElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const content =
    status.reason === "current"
      ? stateCopy[status.state]
      : stateCopy[status.reason];
  const accessibleContent = `${content.slice(0, 1).toLowerCase()}${content.slice(1)}`;
  const report = status.report;
  const severityCounts = report
    ? severityLabels.filter(([key]) => report.severity[key] > 0)
    : [];
  const popoverId = `tavernkeeper-scan-${projectId}`;
  const headingId = `${popoverId}-heading`;

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const closePopover = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
    setPosition(null);
  }, [clearCloseTimer]);

  const openPopover = useCallback(() => {
    clearCloseTimer();
    if (activeDismiss && activeDismiss !== closePopover) activeDismiss();
    setOpen(true);
  }, [clearCloseTimer, closePopover]);

  const delayClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(closePopover, CLOSE_DELAY);
  }, [clearCloseTimer, closePopover]);

  const containsInteractiveElement = useCallback(
    (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      return Boolean(
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target),
      );
    },
    [],
  );

  const closeOnFocusExit = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      if (!containsInteractiveElement(event.relatedTarget)) closePopover();
    },
    [closePopover, containsInteractiveElement],
  );

  const focusReportLink = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (
        event.key !== "Tab" ||
        event.shiftKey ||
        !open ||
        !reportLinkRef.current
      ) {
        return;
      }
      event.preventDefault();
      reportLinkRef.current.focus();
    },
    [open],
  );

  const focusTrigger = useCallback(
    (event: ReactKeyboardEvent<HTMLAnchorElement>) => {
      if (event.key !== "Tab" || !event.shiftKey) return;
      event.preventDefault();
      triggerRef.current?.focus();
    },
    [],
  );

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return;
    setPosition(
      popoverPosition(
        triggerRef.current.getBoundingClientRect(),
        popoverRef.current.getBoundingClientRect(),
      ),
    );
  }, []);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!open) return;
    activeDismiss = closePopover;
    return () => {
      if (activeDismiss === closePopover) activeDismiss = null;
    };
  }, [closePopover, open]);

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
    const dismissOnPointerDown = (event: PointerEvent) => {
      if (!containsInteractiveElement(event.target)) closePopover();
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePopover();
    };
    const dismissOnFocus = (event: globalThis.FocusEvent) => {
      if (!containsInteractiveElement(event.target)) closePopover();
    };

    document.addEventListener("pointerdown", dismissOnPointerDown);
    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("focusin", dismissOnFocus);
    return () => {
      document.removeEventListener("pointerdown", dismissOnPointerDown);
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("focusin", dismissOnFocus);
    };
  }, [closePopover, containsInteractiveElement, open]);

  return (
    <>
      <button
        aria-controls={popoverId}
        aria-expanded={open}
        aria-label={`TavernKeeper scan: ${accessibleContent}`}
        className={`tavernkeeper-scan-indicator-trigger tavernkeeper-scan-indicator-${status.state}`}
        onBlur={closeOnFocusExit}
        onClick={() => (open ? closePopover() : openPopover())}
        onFocus={openPopover}
        onKeyDown={focusReportLink}
        onPointerEnter={openPopover}
        onPointerLeave={delayClose}
        onPointerDown={(event) => {
          if (event.pointerType === "touch") event.preventDefault();
        }}
        ref={triggerRef}
        type="button"
      >
        <TavernKeeperScanIcon />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <section
              aria-labelledby={headingId}
              className="tavernkeeper-popover"
              id={popoverId}
              onBlurCapture={closeOnFocusExit}
              onFocusCapture={openPopover}
              onPointerEnter={openPopover}
              onPointerLeave={delayClose}
              ref={popoverRef}
              role="dialog"
              style={{
                ...position,
                visibility: position ? "visible" : "hidden",
              }}
            >
              <h2 id={headingId}>TavernKeeper Scan Results</h2>
              <p>{content}</p>
              {report ? (
                <>
                  {severityCounts.length ? (
                    <p className="tavernkeeper-severity-counts">
                      {severityCounts.map(([key, label]) => (
                        <span key={key}>
                          {report.severity[key]} {label}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  <p>
                    Scanned{" "}
                    <span aria-label={`Full commit SHA: ${report.scannedSha}`}>
                      {report.scannedSha.slice(0, 7)}
                    </span>{" "}
                    on {formatDate(report.scannedAt)}
                  </p>
                  <a
                    href={report.reportUrl}
                    onKeyDown={focusTrigger}
                    ref={reportLinkRef}
                  >
                    View full report
                  </a>
                </>
              ) : null}
            </section>,
            document.body,
          )
        : null}
    </>
  );
}
