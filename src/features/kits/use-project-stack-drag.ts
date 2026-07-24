"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

export type DragState = {
  projectId: string;
  pointerId: number;
  overProjectId: string | null;
  placement: "before" | "after" | null;
};

function placeProject(
  projectIds: string[],
  projectId: string,
  overProjectId: string,
  placement: "before" | "after",
) {
  if (projectId === overProjectId) return projectIds;
  const remaining = projectIds.filter((id) => id !== projectId);
  const targetIndex = remaining.indexOf(overProjectId);
  if (targetIndex < 0 || remaining.length === projectIds.length) {
    return projectIds;
  }
  const insertionIndex = targetIndex + (placement === "after" ? 1 : 0);
  remaining.splice(insertionIndex, 0, projectId);
  return remaining.every((id, index) => id === projectIds[index])
    ? projectIds
    : remaining;
}

export function useProjectStackDrag({
  projectIds,
  onReorder,
  scrollContainerRef,
}: {
  projectIds: string[];
  onReorder: (projectIds: string[]) => void;
  scrollContainerRef: RefObject<HTMLElement | null>;
}) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const handleRef = useRef<HTMLElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const pointerYRef = useRef(0);
  const cleanupRef = useRef<() => void>(() => undefined);

  const stopAutoscroll = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const startAutoscroll = useCallback(() => {
    stopAutoscroll();
    const tick = () => {
      const container = scrollContainerRef.current;
      if (container && dragRef.current) {
        const bounds = container.getBoundingClientRect();
        const distanceTop = pointerYRef.current - bounds.top;
        const distanceBottom = bounds.bottom - pointerYRef.current;
        if (distanceTop < 40) container.scrollBy({ top: -10 });
        else if (distanceBottom < 40) container.scrollBy({ top: 10 });
      }
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
  }, [scrollContainerRef, stopAutoscroll]);

  const begin = useCallback(
    (projectId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const initial: DragState = {
        projectId,
        pointerId: event.pointerId,
        overProjectId: null,
        placement: null,
      };
      dragRef.current = initial;
      handleRef.current = event.currentTarget;
      pointerYRef.current = event.clientY;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragState(initial);

      const cleanup = () => {
        stopAutoscroll();
        const handle = handleRef.current;
        const pointerId = dragRef.current?.pointerId;
        if (handle && pointerId !== undefined) {
          try {
            handle.releasePointerCapture(pointerId);
          } catch {
            // Capture may already be released by the browser.
          }
        }
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", keydown);
        handle?.removeEventListener("lostpointercapture", cancel);
        dragRef.current = null;
        handleRef.current = null;
        setDragState(null);
      };
      const move = (pointerEvent: PointerEvent) => {
        const current = dragRef.current;
        if (!current || pointerEvent.pointerId !== current.pointerId) return;
        pointerYRef.current = pointerEvent.clientY;
        const target = document
          .elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
          ?.closest<HTMLElement>("[data-project-id]");
        const overProjectId = target?.dataset.projectId ?? null;
        const placement: DragState["placement"] =
          target && overProjectId && overProjectId !== current.projectId
            ? pointerEvent.clientY <
              target.getBoundingClientRect().top +
                target.getBoundingClientRect().height / 2
              ? "before"
              : "after"
            : null;
        const next = { ...current, overProjectId, placement };
        dragRef.current = next;
        setDragState(next);
      };
      const finish = (pointerEvent: PointerEvent) => {
        const current = dragRef.current;
        if (!current || pointerEvent.pointerId !== current.pointerId) return;
        if (current.overProjectId && current.placement) {
          const reordered = placeProject(
            projectIds,
            current.projectId,
            current.overProjectId,
            current.placement,
          );
          if (reordered !== projectIds) onReorder(reordered);
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
      event.currentTarget.addEventListener("lostpointercapture", cancel);
      startAutoscroll();
    },
    [onReorder, projectIds, startAutoscroll, stopAutoscroll],
  );

  useEffect(() => () => cleanupRef.current(), []);

  return { dragState, begin };
}
