"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import { normalizeKitProjectIds } from "@/features/kits/kit-project-layout";
import { planKitProjectBatch } from "@/features/kits/project-batch";
import { removeProject } from "@/features/kits/project-stack-order";
import type { CatalogKit, KitDraft } from "@/features/kits/kit-types";

const builderCollapsedStorageKey = "tavernary:kit-builder-collapsed";
const builderCollapsedChangeEvent = "tavernary-kit-builder-collapsed-change";
let volatileBuilderCollapsed = true;

export type KitBuilderState =
  | { mode: "intro"; collapsed: boolean }
  | { mode: "inspect"; collapsed: boolean; kitId: string }
  | {
      mode: "build";
      collapsed: boolean;
      draft: KitDraft;
      dirty: boolean;
    };

type KitBuilderContentState =
  | { mode: "intro" }
  | { mode: "inspect"; kitId: string }
  | {
      mode: "build";
      draft: KitDraft;
      dirty: boolean;
    };

function normalizedKitProjectIds(kit: CatalogKit) {
  return normalizeKitProjectIds(
    kit.components.map(({ projectId }) => projectId),
    kit.components.map(({ projectId, kind }) => ({ id: projectId, kind })),
  );
}

function storedBuilderCollapsed() {
  try {
    const stored = window.localStorage.getItem(builderCollapsedStorageKey);
    return stored === null ? true : stored === "true";
  } catch {
    return volatileBuilderCollapsed;
  }
}

function serverBuilderCollapsed() {
  return true;
}

function subscribeBuilderCollapsed(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === builderCollapsedStorageKey) listener();
  };
  window.addEventListener(builderCollapsedChangeEvent, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(builderCollapsedChangeEvent, listener);
    window.removeEventListener("storage", onStorage);
  };
}

function storeBuilderCollapsed(collapsed: boolean) {
  volatileBuilderCollapsed = collapsed;
  try {
    window.localStorage.setItem(builderCollapsedStorageKey, String(collapsed));
  } catch {
    // The in-memory state remains authoritative when storage is unavailable.
  }
  window.dispatchEvent(new Event(builderCollapsedChangeEvent));
}

export function useKitBuilder({
  selectedKitId,
  onSelectKit,
}: {
  selectedKitId: string;
  onSelectKit: (kitId: string) => void;
}) {
  const [contentState, setContentState] = useState<KitBuilderContentState>(
    () =>
      selectedKitId
        ? { mode: "inspect", kitId: selectedKitId }
        : { mode: "intro" },
  );
  const collapsed = useSyncExternalStore(
    subscribeBuilderCollapsed,
    storedBuilderCollapsed,
    serverBuilderCollapsed,
  );
  const state = useMemo<KitBuilderState>(
    () => ({ ...contentState, collapsed }),
    [collapsed, contentState],
  );
  const [draftOrigin, setDraftOrigin] = useState<
    "create" | "duplicate" | "edit" | null
  >(null);
  const [originalProjectIds, setOriginalProjectIds] = useState<string[]>([]);
  const selectionStartedDraftRef = useRef(false);

  useEffect(() => {
    if (!selectedKitId) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      selectionStartedDraftRef.current = false;
      setContentState({
        mode: "inspect",
        kitId: selectedKitId,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedKitId]);

  const selectKit = useCallback(
    (kitId: string) => {
      selectionStartedDraftRef.current = false;
      storeBuilderCollapsed(false);
      onSelectKit(kitId);
      setContentState({
        mode: "inspect",
        kitId,
      });
    },
    [onSelectKit],
  );

  const toggleCollapsed = useCallback(
    () => storeBuilderCollapsed(!collapsed),
    [collapsed],
  );

  const startCreate = useCallback(() => {
    selectionStartedDraftRef.current = false;
    storeBuilderCollapsed(false);
    setDraftOrigin("create");
    setOriginalProjectIds([]);
    setContentState({
      mode: "build",
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
    selectionStartedDraftRef.current = false;
    storeBuilderCollapsed(false);
    const projectIds = normalizedKitProjectIds(kit);
    setDraftOrigin("duplicate");
    setOriginalProjectIds(projectIds);
    setContentState({
      mode: "build",
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
    selectionStartedDraftRef.current = false;
    storeBuilderCollapsed(false);
    const projectIds = normalizedKitProjectIds(kit);
    setDraftOrigin("edit");
    setOriginalProjectIds(projectIds);
    setContentState({
      mode: "build",
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
    setContentState((current) =>
      current.mode === "build"
        ? {
            ...current,
            dirty: true,
            draft: { ...current.draft, ...patch },
          }
        : current,
    );
  }, []);

  const startSelectionDraft = useCallback(
    (options?: { collapsed?: boolean }) => {
      if (state.mode === "build") return;
      selectionStartedDraftRef.current = true;
      setDraftOrigin("create");
      setOriginalProjectIds([]);
      storeBuilderCollapsed(options?.collapsed ?? collapsed);
      setContentState({
        mode: "build",
        dirty: false,
        draft: {
          operation: "create",
          kitId: null,
          title: "",
          description: "",
          projectIds: [],
        },
      });
    },
    [collapsed, state.mode],
  );

  const discardUntouchedSelectionDraft = useCallback(() => {
    if (!selectionStartedDraftRef.current) return;
    setContentState((current) => {
      if (
        current.mode !== "build" ||
        current.dirty ||
        current.draft.title ||
        current.draft.description ||
        current.draft.projectIds.length > 0
      ) {
        return current;
      }
      selectionStartedDraftRef.current = false;
      return { mode: "intro" };
    });
  }, []);

  const removeProjectFromDraft = useCallback(
    (projectId: string) => {
      const removed =
        state.mode === "build" && state.draft.projectIds.includes(projectId);
      if (!removed) return false;
      setContentState((current) => {
        if (
          current.mode !== "build" ||
          !current.draft.projectIds.includes(projectId)
        ) {
          return current;
        }
        return {
          ...current,
          dirty: true,
          draft: {
            ...current.draft,
            projectIds: removeProject(current.draft.projectIds, projectId),
          },
        };
      });
      return true;
    },
    [state],
  );

  const applyProjectBatch = useCallback(
    (selectedProjectIds: string[], projects: CatalogProject[]) => {
      const draftProjectIds =
        contentState.mode === "build" ? contentState.draft.projectIds : [];
      const plan = planKitProjectBatch({
        draftProjectIds,
        selectedProjectIds,
        projects,
      });
      if (plan.addedProjectIds.length === 0) return plan;
      selectionStartedDraftRef.current = false;

      if (contentState.mode === "build") {
        setContentState({
          ...contentState,
          dirty: true,
          draft: {
            ...contentState.draft,
            projectIds: plan.projectIds,
          },
        });
      } else {
        setDraftOrigin("create");
        setOriginalProjectIds([]);
        setContentState({
          mode: "build",
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
    [contentState],
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
    selectKit,
    toggleCollapsed,
    startCreate,
    startSelectionDraft,
    discardUntouchedSelectionDraft,
    startDuplicate,
    startEdit,
    updateDraft,
    removeProjectFromDraft,
    applyProjectBatch,
    draftOrigin,
    originalProjectIds,
  };
}
