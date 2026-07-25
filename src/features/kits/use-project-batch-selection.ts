"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
} from "react";

import type { CatalogProject } from "@/features/catalog/catalog-types";
import {
  planKitProjectBatch,
  type KitBatchPlan,
} from "@/features/kits/project-batch";

export type ProjectSelectionBindings = {
  selected: boolean;
  inDraft: boolean;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
  onClick: MouseEventHandler<HTMLElement>;
  onKeyDown: KeyboardEventHandler<HTMLElement>;
};

type PressSession = {
  projectId: string;
  pointerId: number;
  originX: number;
  originY: number;
  timer: number;
};

export function useProjectBatchSelection({
  projects,
  draftProjectIds,
  active,
  onApply,
}: {
  projects: CatalogProject[];
  draftProjectIds: string[];
  active: boolean;
  onApply: (projectIds: string[]) => KitBatchPlan;
}) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [limitReached, setLimitReached] = useState(false);
  const pressRef = useRef<PressSession | null>(null);
  const suppressClickRef = useRef(false);

  const cancelPress = useCallback(() => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  }, []);
  const clear = useCallback(() => {
    cancelPress();
    setSelectedProjectIds([]);
    setLimitReached(false);
  }, [cancelPress]);
  const toggleProject = useCallback(
    (projectId: string) => {
      if (draftProjectIds.includes(projectId)) return false;
      if (selectedProjectIds.includes(projectId)) {
        setSelectedProjectIds((current) =>
          current.filter((id) => id !== projectId),
        );
        setLimitReached(false);
        return true;
      }
      const project = projects.find(({ id }) => id === projectId);
      const withoutFrontend =
        project?.kind === "frontend"
          ? selectedProjectIds.filter(
              (id) =>
                projects.find((candidate) => candidate.id === id)?.kind !==
                "frontend",
            )
          : selectedProjectIds;
      const candidate = [...withoutFrontend, projectId];
      const plan = planKitProjectBatch({
        draftProjectIds,
        selectedProjectIds: candidate,
        projects,
      });
      if (!plan.addedProjectIds.includes(projectId)) {
        setLimitReached(plan.limitReached);
        return false;
      }
      setSelectedProjectIds(candidate);
      setLimitReached(false);
      return true;
    },
    [draftProjectIds, projects, selectedProjectIds],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      clear();
    };
    window.addEventListener("scroll", cancelPress, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", cancelPress, true);
      window.removeEventListener("keydown", handleKeyDown);
      cancelPress();
    };
  }, [cancelPress, clear]);

  useEffect(() => {
    if (!active) clear();
  }, [active, clear]);

  const bindingsFor = useCallback(
    (projectId: string): ProjectSelectionBindings => ({
      selected: selectedProjectIds.includes(projectId),
      inDraft: draftProjectIds.includes(projectId),
      onPointerDown: (event) => {
        if (
          !active ||
          event.button !== 0 ||
          draftProjectIds.includes(projectId)
        ) {
          return;
        }
        if (
          event.target instanceof Element &&
          event.target.closest("[data-project-drag-handle]")
        ) {
          return;
        }
        cancelPress();
        const timer = window.setTimeout(() => {
          if (toggleProject(projectId)) {
            suppressClickRef.current = true;
            navigator.vibrate?.(10);
          }
          pressRef.current = null;
        }, 450);
        pressRef.current = {
          projectId,
          pointerId: event.pointerId,
          originX: event.clientX,
          originY: event.clientY,
          timer,
        };
      },
      onPointerMove: (event) => {
        const press = pressRef.current;
        if (!press || press.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - press.originX;
        const deltaY = event.clientY - press.originY;
        if (deltaX * deltaX + deltaY * deltaY > 8 ** 2) cancelPress();
      },
      onPointerUp: cancelPress,
      onPointerCancel: cancelPress,
      onClick: (event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (selectedProjectIds.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        toggleProject(projectId);
      },
      onKeyDown: (event) => {
        if (
          !active ||
          (event.key !== " " &&
            !(event.key === "Enter" && selectedProjectIds.length > 0))
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        toggleProject(projectId);
      },
    }),
    [active, cancelPress, draftProjectIds, selectedProjectIds, toggleProject],
  );
  const draftFrontend = projects.find(
    ({ id, kind }) => kind === "frontend" && draftProjectIds.includes(id),
  );
  const selectedFrontend = projects.find(
    ({ id, kind }) => kind === "frontend" && selectedProjectIds.includes(id),
  );
  const replacementFrontendName =
    draftFrontend &&
    selectedFrontend &&
    draftFrontend.id !== selectedFrontend.id
      ? draftFrontend.name
      : null;
  const apply = useCallback(() => {
    if (selectedProjectIds.length === 0) return null;
    const plan = onApply(selectedProjectIds);
    clear();
    return plan;
  }, [clear, onApply, selectedProjectIds]);

  return {
    selectionMode: selectedProjectIds.length > 0,
    selectedProjectIds,
    selectedCount: selectedProjectIds.length,
    limitReached,
    replacementFrontendName,
    bindingsFor,
    clear,
    apply,
  };
}
