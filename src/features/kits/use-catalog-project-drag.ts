"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import type { CatalogProject } from "@/features/catalog/catalog-types";
import {
  exceedsDragThreshold,
  type Point,
} from "@/features/kits/project-stack-drag-geometry";

export type CatalogDropTarget = "frontend" | "stack" | null;

export type CatalogProjectDragState = {
  projectId: string;
  projectName: string;
  kind: CatalogProject["kind"];
  point: Point;
  target: CatalogDropTarget;
  valid: boolean;
  actionLabel: string;
};

type Session = CatalogProjectDragState & {
  pointerId: number;
  origin: Point;
  handle: HTMLElement;
  captured: boolean;
};

export function useCatalogProjectDrag({
  editorRef,
  onDrop,
}: {
  editorRef: RefObject<HTMLElement | null>;
  onDrop: (projectId: string, target: Exclude<CatalogDropTarget, null>) => void;
}) {
  const [dragState, setDragState] = useState<CatalogProjectDragState | null>(
    null,
  );
  const sessionRef = useRef<Session | null>(null);
  const cleanupRef = useRef<() => void>(() => undefined);

  const begin = useCallback(
    (
      project: Pick<CatalogProject, "id" | "name" | "kind">,
      event: ReactPointerEvent<HTMLElement>,
    ) => {
      if (event.button !== 0) return;
      cleanupRef.current();
      const point = { x: event.clientX, y: event.clientY };
      sessionRef.current = {
        projectId: project.id,
        projectName: project.name,
        kind: project.kind,
        point,
        target: null,
        valid: false,
        actionLabel: "",
        pointerId: event.pointerId,
        origin: point,
        handle: event.currentTarget,
        captured: false,
      };

      const cleanup = () => {
        const current = sessionRef.current;
        sessionRef.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", keydown);
        current?.handle.removeEventListener("lostpointercapture", cancel);
        if (current?.captured) {
          try {
            current.handle.releasePointerCapture(current.pointerId);
          } catch {
            // Capture may already have been released.
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
          !current.captured &&
          !exceedsDragThreshold(current.origin, nextPoint)
        ) {
          return;
        }
        if (!current.captured) {
          current.handle.setPointerCapture(current.pointerId);
          current.captured = true;
        }
        const targetElement = document
          .elementFromPoint?.(nextPoint.x, nextPoint.y)
          ?.closest<HTMLElement>("[data-kit-drop-target]");
        const rawTarget = targetElement?.dataset.kitDropTarget;
        const target: CatalogDropTarget =
          targetElement &&
          editorRef.current?.contains(targetElement) &&
          (rawTarget === "frontend" || rawTarget === "stack")
            ? rawTarget
            : null;
        const valid =
          (target === "frontend" && current.kind === "frontend") ||
          (target === "stack" && current.kind !== "frontend");
        const currentFrontend =
          targetElement?.dataset.currentFrontendName ?? "";
        const actionLabel = valid
          ? target === "frontend" && currentFrontend
            ? `Release to replace ${currentFrontend}`
            : "Release to add"
          : "Not a valid Kit target";
        const next = {
          ...current,
          point: nextPoint,
          target,
          valid,
          actionLabel,
        };
        sessionRef.current = next;
        setDragState(next);
      };

      const finish = (pointerEvent: PointerEvent) => {
        const current = sessionRef.current;
        if (!current || pointerEvent.pointerId !== current.pointerId) return;
        if (current.valid && current.target) {
          onDrop(current.projectId, current.target);
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
    [editorRef, onDrop],
  );

  useEffect(() => () => cleanupRef.current(), []);

  return { dragState, begin };
}
