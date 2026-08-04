"use client";

import { createPortal } from "react-dom";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { TavernKeeperScanIcon } from "@/components/icons/tavernkeeper-scan-icon";
import { TavernKeeperFreshnessClockIcon } from "@/components/icons/tavernkeeper-freshness-clock-icon";
import type { TavernKeeperCardStatus } from "@/features/catalog/tavernkeeper-status";
import { TavernKeeperHistoryStrip } from "./tavernkeeper-history-strip";

const encodedCitationPattern = /\s*\uE200cite\uE202[^\uE201]*\uE201/giu;
const findingReferencePattern =
  /\s*\((?:V\d+\s+)?findings?\s+[^)]*\b[0-9a-f]{64}\b[^)]*\)/giu;
const bracketedFindingReferencePattern = /\s*\[[0-9a-f]{64}\]/giu;
const invisibleFormattingPattern = /[\u200B-\u200D\u2060\uFEFF]/gu;

function conciseAssessmentSummary(summary: string) {
  const withoutArtifacts = summary
    .replace(encodedCitationPattern, "")
    .replace(findingReferencePattern, "")
    .replace(bracketedFindingReferencePattern, "")
    .replace(invisibleFormattingPattern, "");
  let display = withoutArtifacts.replace(/\s+/gu, " ").trim();

  if (withoutArtifacts !== summary && !/[.!?]["')\]]?$/u.test(display)) {
    const lastCompleteSentence = Math.max(
      display.lastIndexOf("."),
      display.lastIndexOf("!"),
      display.lastIndexOf("?"),
    );
    if (lastCompleteSentence >= 0) {
      display = display.slice(0, lastCompleteSentence + 1);
    }
  }

  return display;
}

function stateCopy(status: TavernKeeperCardStatus) {
  if (status.report) {
    const freshness =
      status.freshness === "stale"
        ? " This assessment covers an older commit. An updated scan is pending."
        : status.freshness === "unavailable"
          ? " Tavernary cannot confirm the repository's current commit, so freshness is unavailable."
          : "";
    return `${conciseAssessmentSummary(status.report.summary)}${freshness}`;
  }
  if (status.state === "unsupported") {
    return "TavernKeeper scanning is not supported for this project's source.";
  }
  if (status.freshness === "unavailable") {
    return "Tavernary cannot confirm the repository's current commit, and no completed assessment is available.";
  }
  return "This project hasn't been scanned by TavernKeeper.";
}

const freshnessLabels = {
  current: "current",
  stale: "stale assessment",
  unavailable: "freshness unavailable",
  unassessed: "not assessed",
  unsupported: "unsupported source",
};
const riskGradeLabels = {
  low: "Low concern",
  material: "Material concern",
  high: "High concern",
};

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function accessibleStatus(status: TavernKeeperCardStatus) {
  if (!status.report) {
    if (status.freshness === "unsupported") return "Unsupported source.";
    if (status.freshness === "unavailable") {
      return "Not assessed; freshness unavailable.";
    }
    return "Not assessed.";
  }
  return `${riskGradeLabels[status.report.riskLevel]}; ${freshnessLabels[status.freshness]}.`;
}

const CLOSE_DELAY = 150;
const VIEWPORT_MARGIN = 8;
const POPOVER_GAP = 8;

let activeDismiss: (() => void) | null = null;

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
    trigger.left + trigger.width / 2 - popover.width / 2,
    viewport.left + VIEWPORT_MARGIN,
    viewport.left + viewport.width - popover.width - VIEWPORT_MARGIN,
  );
  const above = trigger.top - popover.height - POPOVER_GAP;
  const below = trigger.bottom + POPOVER_GAP;
  const top = clamp(
    above >= viewport.top + VIEWPORT_MARGIN ? above : below,
    viewport.top + VIEWPORT_MARGIN,
    viewport.top + viewport.height - popover.height - VIEWPORT_MARGIN,
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
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerOpenState = useRef<boolean | null>(null);
  const content = stateCopy(status);
  const report = status.report;
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

  const openFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch") openPopover();
    },
    [openPopover],
  );

  const rememberPointerOpenState = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      pointerOpenState.current = event.pointerType === "touch" ? open : null;
    },
    [open],
  );

  const togglePopover = useCallback(() => {
    const wasOpenBeforePointerFocus = pointerOpenState.current;
    pointerOpenState.current = null;
    if (wasOpenBeforePointerFocus === true) {
      closePopover();
    } else {
      openPopover();
    }
  }, [closePopover, openPopover]);

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

  const focusFirstLink = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (
        event.key !== "Tab" ||
        event.shiftKey ||
        !open ||
        !firstLinkRef.current
      ) {
        return;
      }
      event.preventDefault();
      firstLinkRef.current.focus();
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
    window.addEventListener("scroll", updatePosition, {
      capture: true,
      passive: true,
    });
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const dismissOnPointerDown = (event: PointerEvent) => {
      if (!containsInteractiveElement(event.target)) closePopover();
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopover();
        triggerRef.current?.focus();
      }
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
        aria-label={`TavernKeeper scan: ${accessibleStatus(status)}`}
        className={`tavernkeeper-scan-indicator-trigger tavernkeeper-scan-indicator-${status.state}`}
        onBlur={closeOnFocusExit}
        onClick={togglePopover}
        onFocus={openPopover}
        onKeyDown={focusFirstLink}
        onMouseEnter={openPopover}
        onMouseLeave={delayClose}
        onPointerDown={rememberPointerOpenState}
        onPointerEnter={openFromPointer}
        onPointerLeave={delayClose}
        ref={triggerRef}
        type="button"
      >
        <TavernKeeperScanIcon />
        {status.freshness === "stale" ? (
          <TavernKeeperFreshnessClockIcon />
        ) : null}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <section
              aria-labelledby={headingId}
              className="tavernkeeper-popover"
              id={popoverId}
              onBlurCapture={closeOnFocusExit}
              onFocusCapture={openPopover}
              onMouseEnter={openPopover}
              onMouseLeave={delayClose}
              onPointerEnter={openFromPointer}
              onPointerLeave={delayClose}
              ref={popoverRef}
              role="dialog"
              style={{
                ...position,
                visibility: position ? "visible" : "hidden",
              }}
            >
              <header className="tavernkeeper-popover-header">
                <h2 id={headingId}>TavernKeeper Scan Results</h2>
                {report ? (
                  <span
                    className={`tavernkeeper-popover-status tavernkeeper-popover-status-${status.state}`}
                  >
                    <strong>{riskGradeLabels[report.riskLevel]}</strong>
                    <span>{freshnessLabels[status.freshness]}</span>
                  </span>
                ) : null}
              </header>
              {report ? (
                <>
                  <p className="tavernkeeper-summary">{content}</p>
                  <p
                    aria-label="Assessment finding counts"
                    className="tavernkeeper-assessment-counts"
                  >
                    <span>
                      {countLabel(report.minorCautions, "minor caution")}
                    </span>
                    <span>
                      {countLabel(report.materialConcerns, "material concern")}
                    </span>
                    <span>
                      {countLabel(report.highDanger, "high-danger finding")}
                    </span>
                  </p>
                  <dl className="tavernkeeper-scan-details">
                    <div>
                      <dt>Scanned</dt>
                      <dd>
                        <time dateTime={report.scannedAt}>
                          {formatDate(report.scannedAt)}
                        </time>
                        <span aria-hidden="true"> · </span>
                        <a
                          aria-label={`Browse scanned source at commit ${report.scannedSha} on GitHub`}
                          href={report.treeUrl}
                          onKeyDown={focusTrigger}
                          ref={firstLinkRef}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {report.scannedSha.slice(0, 7)}
                          <span aria-hidden="true"> ↗</span>
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>Assessed</dt>
                      <dd>
                        <time dateTime={report.assessedAt}>
                          {formatDate(report.assessedAt)}
                        </time>
                        {" by Tavernary"}
                      </dd>
                    </div>
                  </dl>
                  {status.history.length >= 2 ? (
                    <div className="tavernkeeper-recent-history">
                      <span>Recent scans</span>
                      <TavernKeeperHistoryStrip history={status.history} />
                    </div>
                  ) : null}
                  <footer className="tavernkeeper-popover-actions">
                    <a
                      href={report.reportUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      View full report<span aria-hidden="true"> ↗</span>
                    </a>
                    {status.historyUrl ? (
                      <Link href={status.historyUrl}>
                        View scan history<span aria-hidden="true"> →</span>
                      </Link>
                    ) : null}
                  </footer>
                </>
              ) : (
                <p className="tavernkeeper-summary">{content}</p>
              )}
            </section>,
            document.body,
          )
        : null}
    </>
  );
}
