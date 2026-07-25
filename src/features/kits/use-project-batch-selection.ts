"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { CatalogProject } from "@/features/catalog/catalog-types";
import {
  planKitProjectBatch,
  type KitBatchPlan,
} from "@/features/kits/project-batch";

export type ProjectKitControlState = "available" | "selected" | "in-kit";

export type ProjectSelectionBindings = {
  state: ProjectKitControlState;
  disabled: boolean;
  disabledReason: string | null;
  onActivate: () => void;
};

const noOp = () => undefined;
const noRemoval = () => false;

export function useProjectBatchSelection({
  projects,
  draftProjectIds,
  active,
  onApply,
  onFirstSelection = noOp,
  onSelectionEmpty = noOp,
  onRemoveFromDraft = noRemoval,
  onStatus = noOp,
}: {
  projects: CatalogProject[];
  draftProjectIds: string[];
  active: boolean;
  onApply: (projectIds: string[]) => KitBatchPlan;
  onFirstSelection?: () => void;
  onSelectionEmpty?: () => void;
  onRemoveFromDraft?: (projectId: string) => boolean;
  onStatus?: (message: string) => void;
}) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [limitReached, setLimitReached] = useState(false);
  const [nothingCanBeAdded, setNothingCanBeAdded] = useState(false);
  const activeSelectedProjectIds = useMemo(
    () => (active ? selectedProjectIds : []),
    [active, selectedProjectIds],
  );
  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const clear = useCallback(() => {
    if (selectedProjectIds.length === 0) return;
    setSelectedProjectIds([]);
    setLimitReached(false);
    setNothingCanBeAdded(false);
    onSelectionEmpty();
  }, [onSelectionEmpty, selectedProjectIds.length]);

  const candidateFor = useCallback(
    (projectId: string) => {
      const project = projectsById.get(projectId);
      if (!project) return activeSelectedProjectIds;
      const withoutFrontend =
        project.kind === "frontend"
          ? activeSelectedProjectIds.filter(
              (id) => projectsById.get(id)?.kind !== "frontend",
            )
          : activeSelectedProjectIds;
      return [...withoutFrontend, projectId];
    },
    [activeSelectedProjectIds, projectsById],
  );

  const toggleProject = useCallback(
    (projectId: string) => {
      const project = projectsById.get(projectId);
      if (!project || draftProjectIds.includes(projectId)) return false;
      if (activeSelectedProjectIds.includes(projectId)) {
        const next = activeSelectedProjectIds.filter((id) => id !== projectId);
        setSelectedProjectIds(next);
        setLimitReached(false);
        setNothingCanBeAdded(false);
        onStatus(`${project.name} removed from selection`);
        if (next.length === 0) onSelectionEmpty();
        return true;
      }

      const candidate = candidateFor(projectId);
      const plan = planKitProjectBatch({
        draftProjectIds,
        selectedProjectIds: candidate,
        projects,
      });
      if (!plan.addedProjectIds.includes(projectId)) {
        setLimitReached(plan.limitReached);
        if (plan.limitReached) onStatus("Kit limit reached; 50 projects");
        return false;
      }

      if (activeSelectedProjectIds.length === 0) onFirstSelection();
      setSelectedProjectIds(candidate);
      setLimitReached(false);
      setNothingCanBeAdded(false);
      onStatus(`${project.name} selected`);
      return true;
    },
    [
      activeSelectedProjectIds,
      candidateFor,
      draftProjectIds,
      onFirstSelection,
      onSelectionEmpty,
      onStatus,
      projects,
      projectsById,
    ],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clear]);

  useEffect(() => {
    if (active || selectedProjectIds.length === 0) return;
    const timer = window.setTimeout(clear, 0);
    return () => window.clearTimeout(timer);
  }, [active, clear, selectedProjectIds.length]);

  const bindingsFor = useCallback(
    (projectId: string): ProjectSelectionBindings => {
      const project = projectsById.get(projectId);
      const selected = activeSelectedProjectIds.includes(projectId);
      const inDraft = draftProjectIds.includes(projectId);
      const candidate = candidateFor(projectId);
      const candidatePlan = planKitProjectBatch({
        draftProjectIds,
        selectedProjectIds: candidate,
        projects,
      });
      const disabled =
        !project ||
        (!selected &&
          !inDraft &&
          !candidatePlan.addedProjectIds.includes(projectId));

      return {
        state: inDraft ? "in-kit" : selected ? "selected" : "available",
        disabled,
        disabledReason: disabled ? "Kit limit reached · 50 projects" : null,
        onActivate: () => {
          if (!active || disabled || !project) return;
          if (inDraft) {
            if (onRemoveFromDraft(projectId)) {
              onStatus(`${project.name} removed from Kit`);
            }
            return;
          }
          toggleProject(projectId);
        },
      };
    },
    [
      active,
      activeSelectedProjectIds,
      candidateFor,
      draftProjectIds,
      onRemoveFromDraft,
      onStatus,
      projects,
      projectsById,
      toggleProject,
    ],
  );

  const draftFrontend = projects.find(
    ({ id, kind }) => kind === "frontend" && draftProjectIds.includes(id),
  );
  const selectedFrontend = projects.find(
    ({ id, kind }) =>
      kind === "frontend" && activeSelectedProjectIds.includes(id),
  );
  const replacementFrontendName =
    draftFrontend &&
    selectedFrontend &&
    draftFrontend.id !== selectedFrontend.id
      ? draftFrontend.name
      : null;
  const selectedFrontendName = selectedFrontend?.name ?? null;
  const apply = useCallback(() => {
    if (activeSelectedProjectIds.length === 0) return null;
    const plan = onApply(activeSelectedProjectIds);
    if (plan.addedProjectIds.length === 0) {
      setNothingCanBeAdded(true);
      setLimitReached(plan.limitReached);
      return plan;
    }
    setSelectedProjectIds([]);
    setLimitReached(false);
    setNothingCanBeAdded(false);
    return plan;
  }, [activeSelectedProjectIds, onApply]);

  return {
    selectionMode: activeSelectedProjectIds.length > 0,
    selectedProjectIds: activeSelectedProjectIds,
    selectedCount: activeSelectedProjectIds.length,
    limitReached,
    nothingCanBeAdded,
    replacementFrontendName,
    selectedFrontendName,
    bindingsFor,
    clear,
    apply,
  };
}
