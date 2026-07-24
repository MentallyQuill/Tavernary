"use client";

import { useCallback, useEffect, useState } from "react";

export type KitWorkspaceState =
  | { mode: "intro"; collapsed: boolean }
  | { mode: "inspect"; collapsed: boolean; kitId: string }
  | {
      mode: "build";
      collapsed: boolean;
      draft: import("@/features/kits/kit-types").KitDraft;
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

  useEffect(() => {
    if (!selectedKitId) return;
    setState((current) => ({
      mode: "inspect",
      collapsed: current.collapsed,
      kitId: selectedKitId,
    }));
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

  return { state, setState, selectKit, toggleCollapsed };
}
