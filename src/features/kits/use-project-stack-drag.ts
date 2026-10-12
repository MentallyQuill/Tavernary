"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
  dragHandleAnchor,
  exceedsDragThreshold,
  isOutsideEditor,
  stackTargetIndex,
  type DragRect,
  type Point,
} from "@/features/kits/project-stack-drag-geometry";

export type ProjectStackDragState = {
  phase: "pressed" | "reorder" | "remove";
  projectId: string;
  pointerId: number;
  point: Point;
  ghostAnchor: Point;
  sourceRect: DragRect | null;
  sourceIndex: number;
  targetIndex: number;
  reorderable: boolean;
};

type DragSession = ProjectStackDragState & {
  origin: Point;
  editorRect: DragRect | null;
  handle: HTMLElement;
  captured: boolean;
};

function reorderProject(
  projectIds: readonly string[],
  sourceIndex: number,
  targetIndex: number,
) {
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return projectIds;
  }
  const next = [...projectIds];
  const [projectId] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, projectId);
  return next;
}

function rectOf(element: Element): DragRect {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function useProjectStackDrag({
  projectIds,
  editorRef,
  stackRef,
  touchLayout,
  onReorder,
  onRemove,
}: {
  projectIds: string[];
  editorRef: RefObject<HTMLElement | null>;
  stackRef: RefObject<HTMLElement | null>;
  touchLayout: boolean;
  onReorder: (projectIds: string[]) => void;
  onRemove: (projectId: string) => void;
}) {
  const [dragState, setDragState] = useState<ProjectStackDragState | null>(
    null,
  );
  const sessionRef = useRef<DragSession | null>(null);
  const cleanupRef = useRef<() => void>(() => undefined);
  const callbacksRef = useRef({ onReorder, onRemove });
  const orderKey = JSON.stringify(projectIds);

  useLayoutEffect(() => {
    callbacksRef.current = { onReorder, onRemove };
  }, [onReorder, onRemove]);

  useLayoutEffect(() => {
    if (sessionRef.current) cleanupRef.current();
  }, [orderKey, touchLayout]);

  const begin = useCallback(
    (
      projectId: string,
      event: ReactPointerEvent<HTMLElement>,
      { reorderable }: { reorderable: boolean },
    ) => {
      if (event.button !== 0) return;
      cleanupRef.current();

      const sourceIndex = projectIds.indexOf(projectId);
      const point = { x: event.clientX, y: event.clientY };
      const initial: DragSession = {
        phase: "pressed",
        projectId,
        pointerId: event.pointerId,
        point,
        ghostAnchor: { x: 0, y: 0 },
        sourceRect: null,
        sourceIndex,
        targetIndex: sourceIndex,
        reorderable,
        origin: point,
        editorRect: null,
        handle: event.currentTarget,
        captured: false,
      };
      sessionRef.current = initial;
      setDragState(initial);
      let frame: number | null = null;
      let latestPoint = point;

      const cleanup = () => {
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        const session = sessionRef.current;
        sessionRef.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", keydown);
        window.removeEventListener("scroll", scheduleMovement, true);
        window.removeEventListener("resize", scheduleMovement);
        session?.handle.removeEventListener("lostpointercapture", cancel);
        if (session?.captured) {
          try {
            session.handle.releasePointerCapture(session.pointerId);
          } catch {
            // The browser may already have released capture.
          }
        }
        setDragState(null);
      };

      const captureForMovement = (nextPoint: Point) => {
        const current = sessionRef.current;
        if (!current) return false;
        if (
          !current.captured &&
          !exceedsDragThreshold(current.origin, nextPoint)
        ) {
          return false;
        }

        if (!current.captured) {
          current.handle.setPointerCapture(current.pointerId);
          current.captured = true;
          const source = current.handle.closest(
            "[data-project-id], .kit-frontend-slot",
          );
          const sourceRect = source ? rectOf(source) : null;
          current.sourceRect = sourceRect;
          current.ghostAnchor = sourceRect
            ? dragHandleAnchor(sourceRect, rectOf(current.handle))
            : { x: 0, y: 0 };
        }
        return true;
      };

      const processMovement = (nextPoint: Point, publish = true) => {
        const current = sessionRef.current;
        if (!current || !captureForMovement(nextPoint)) return;
        current.editorRect = editorRef.current
          ? rectOf(editorRef.current)
          : null;

        const outside =
          !touchLayout &&
          current.editorRect !== null &&
          isOutsideEditor(nextPoint, current.editorRect);
        const phase: ProjectStackDragState["phase"] = outside
          ? "remove"
          : current.reorderable
            ? "reorder"
            : "pressed";
        let targetIndex = current.sourceIndex;

        if (phase === "reorder") {
          const rows = Array.from(
            stackRef.current?.querySelectorAll<HTMLElement>(
              "[data-project-id]",
            ) ?? [],
          ).map((row, index) => ({ index, rect: rectOf(row) }));
          targetIndex = stackTargetIndex(
            nextPoint.y,
            rows,
            current.sourceIndex,
          );
        }

        const next: DragSession = {
          ...current,
          phase,
          point: nextPoint,
          targetIndex,
        };
        sessionRef.current = next;
        if (publish) setDragState(next);
      };

      const scheduleMovement = () => {
        if (!sessionRef.current?.captured || frame !== null) return;
        frame = window.requestAnimationFrame(() => {
          frame = null;
          processMovement(latestPoint);
        });
      };

      const move = (pointerEvent: PointerEvent) => {
        const current = sessionRef.current;
        if (!current || pointerEvent.pointerId !== current.pointerId) return;
        latestPoint = { x: pointerEvent.clientX, y: pointerEvent.clientY };
        // Capture synchronously after the threshold so the browser keeps routing
        // the gesture to the handle, even before the next rendering frame.
        if (captureForMovement(latestPoint)) scheduleMovement();
      };

      const finish = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== sessionRef.current?.pointerId) return;
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        // Pointerup can arrive before rAF, or at a newer position than the last
        // move. Resolve its coordinates before committing, without rendering a
        // ghost that is about to be removed.
        if (sessionRef.current?.captured) {
          processMovement(
            { x: pointerEvent.clientX, y: pointerEvent.clientY },
            false,
          );
        }
        const current = sessionRef.current;
        if (!current) return;
        if (current.phase === "remove") {
          callbacksRef.current.onRemove(current.projectId);
        } else if (current.phase === "reorder") {
          const reordered = reorderProject(
            projectIds,
            current.sourceIndex,
            current.targetIndex,
          );
          if (reordered !== projectIds)
            callbacksRef.current.onReorder([...reordered]);
        }
        cleanup();
      };
      const cancel = () => cleanup();
      const keydown = (keyboardEvent: KeyboardEvent) => {
        if (keyboardEvent.key === "Escape") cleanup();
      };

      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", keydown);
      window.addEventListener("scroll", scheduleMovement, {
        capture: true,
        passive: true,
      });
      window.addEventListener("resize", scheduleMovement);
      event.currentTarget.addEventListener("lostpointercapture", cancel);
    },
    [editorRef, projectIds, stackRef, touchLayout],
  );

  useEffect(() => () => cleanupRef.current(), []);

  return { dragState, begin };
}
