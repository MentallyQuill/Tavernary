"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import { normalizeKitProjectIds } from "@/features/kits/kit-project-layout";
import { planKitProjectBatch } from "@/features/kits/project-batch";
import type { CatalogKit, KitDraft } from "@/features/kits/kit-types";

export type KitBuilderState =
  | { mode: "intro"; collapsed: boolean }
  | { mode: "inspect"; collapsed: boolean; kitId: string }
  | {
      mode: "build";
      collapsed: boolean;
      draft: KitDraft;
      dirty: boolean;
    };

function normalizedKitProjectIds(kit: CatalogKit) {
  return normalizeKitProjectIds(
    kit.components.map(({ projectId }) => projectId),
    kit.components.map(({ projectId, kind }) => ({ id: projectId, kind })),
  );
}

export function useKitBuilder({
  selectedKitId,
  onSelectKit,
}: {
  selectedKitId: string;
  onSelectKit: (kitId: string) => void;
}) {
  const [state, setState] = useState<KitBuilderState>(() =>
    selectedKitId
      ? { mode: "inspect", collapsed: false, kitId: selectedKitId }
      : { mode: "intro", collapsed: false },
  );
  const [draftOrigin, setDraftOrigin] = useState<
    "create" | "duplicate" | "edit" | null
  >(null);
  const [originalProjectIds, setOriginalProjectIds] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedKitId) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setState((current) => ({
        mode: "inspect",
        collapsed: current.collapsed,
        kitId: selectedKitId,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedKitId]);

  const selectKit = useCallback(
    (kitId: string) => {
      onSelectKit(kitId);
      setState((current) => ({
        mode: "inspect",
        collapsed: false,
        kitId,
      }));
    },
    [onSelectKit],
  );

  const toggleCollapsed = useCallback(
    () =>
      setState((current) => ({
        ...current,
        collapsed: !current.collapsed,
      })),
    [],
  );

  const startCreate = useCallback(() => {
    setDraftOrigin("create");
    setOriginalProjectIds([]);
    setState({
      mode: "build",
      collapsed: false,
      dirty: false,
      draft: {
        operation: "create",
        kitId: null,
        title: "",
        description: "",
        projectIds: [],
      },
    });
  }, []);

  const startDuplicate = useCallback((kit: CatalogKit) => {
    const projectIds = normalizedKitProjectIds(kit);
    setDraftOrigin("duplicate");
    setOriginalProjectIds(projectIds);
    setState({
      mode: "build",
      collapsed: false,
      dirty: false,
      draft: {
        operation: "create",
        kitId: null,
        title: kit.title,
        description: kit.description,
        projectIds,
      },
    });
  }, []);

  const startEdit = useCallback((kit: CatalogKit) => {
    const projectIds = normalizedKitProjectIds(kit);
    setDraftOrigin("edit");
    setOriginalProjectIds(projectIds);
    setState({
      mode: "build",
      collapsed: false,
      dirty: false,
      draft: {
        operation: "edit",
        kitId: kit.id,
        title: kit.title,
        description: kit.description,
        projectIds,
      },
    });
  }, []);

  const updateDraft = useCallback((patch: Partial<KitDraft>) => {
    setState((current) =>
      current.mode === "build"
        ? {
            ...current,
            dirty: true,
            draft: { ...current.draft, ...patch },
          }
        : current,
    );
  }, []);

  const applyProjectBatch = useCallback(
    (selectedProjectIds: string[], projects: CatalogProject[]) => {
      const draftProjectIds =
        state.mode === "build" ? state.draft.projectIds : [];
      const plan = planKitProjectBatch({
        draftProjectIds,
        selectedProjectIds,
        projects,
      });
      if (plan.addedProjectIds.length === 0) return plan;

      if (state.mode === "build") {
        setState({
          ...state,
          dirty: true,
          draft: {
            ...state.draft,
            projectIds: plan.projectIds,
          },
        });
      } else {
        setDraftOrigin("create");
        setOriginalProjectIds([]);
        setState({
          mode: "build",
          collapsed: true,
          dirty: true,
          draft: {
            operation: "create",
            kitId: null,
            title: "",
            description: "",
            projectIds: plan.projectIds,
          },
        });
      }

      return plan;
    },
    [state],
  );

  useEffect(() => {
    if (state.mode !== "build" || !state.dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  return {
    state,
    setState,
    selectKit,
    toggleCollapsed,
    startCreate,
    startDuplicate,
    startEdit,
    updateDraft,
    applyProjectBatch,
    draftOrigin,
    originalProjectIds,
  };
}
