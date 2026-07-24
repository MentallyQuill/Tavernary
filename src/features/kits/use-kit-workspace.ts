"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogKit, KitDraft } from "@/features/kits/kit-types";

export type KitWorkspaceState =
  | { mode: "intro"; collapsed: boolean }
  | { mode: "inspect"; collapsed: boolean; kitId: string }
  | {
      mode: "build";
      collapsed: boolean;
      draft: KitDraft;
      dirty: boolean;
    };

export function useKitWorkspace({
  selectedKitId,
  onSelectKit,
}: {
  selectedKitId: string;
  onSelectKit: (kitId: string) => void;
}) {
  const [state, setState] = useState<KitWorkspaceState>(() =>
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
    const timeout = window.setTimeout(
      () =>
        setState((current) => ({
          mode: "inspect",
          collapsed: current.collapsed,
          kitId: selectedKitId,
        })),
      0,
    );
    return () => window.clearTimeout(timeout);
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
    const projectIds = kit.components.map(({ projectId }) => projectId);
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
    const projectIds = kit.components.map(({ projectId }) => projectId);
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
    draftOrigin,
    originalProjectIds,
  };
}
