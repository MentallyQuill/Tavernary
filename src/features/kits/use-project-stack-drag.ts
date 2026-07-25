"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
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

      const cleanup = () => {
        const session = sessionRef.current;
        sessionRef.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", keydown);
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

      const move = (pointerEvent: PointerEvent) => {
        const current = sessionRef.current;
        if (!current || pointerEvent.pointerId !== current.pointerId) return;
        const nextPoint = {
          x: pointerEvent.clientX,
          y: pointerEvent.clientY,
        };
        if (
          current.phase === "pressed" &&
          !exceedsDragThreshold(current.origin, nextPoint)
        ) {
          return;
        }

        if (!current.captured) {
          current.handle.setPointerCapture(current.pointerId);
          current.captured = true;
          current.editorRect = editorRef.current
            ? rectOf(editorRef.current)
            : null;
          const source = current.handle.closest(
            "[data-project-id], .kit-frontend-slot",
          );
          current.sourceRect = source ? rectOf(source) : null;
        }

        const outside =
          !touchLayout &&
          current.editorRect !== null &&
          isOutsideEditor(nextPoint, current.editorRect);
        let phase: ProjectStackDragState["phase"] = outside
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
            pointerEvent.clientY,
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
        setDragState(next);
      };

      const finish = (pointerEvent: PointerEvent) => {
        const current = sessionRef.current;
        if (!current || pointerEvent.pointerId !== current.pointerId) return;
        if (current.phase === "remove") {
          onRemove(current.projectId);
        } else if (current.phase === "reorder") {
          const reordered = reorderProject(
            projectIds,
            current.sourceIndex,
            current.targetIndex,
          );
          if (reordered !== projectIds) onReorder([...reordered]);
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
    },
    [editorRef, onRemove, onReorder, projectIds, stackRef, touchLayout],
  );

  useEffect(() => () => cleanupRef.current(), []);

  return { dragState, begin };
}
