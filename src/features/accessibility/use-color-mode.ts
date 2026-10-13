"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import {
  applyColorMode,
  getColorMode,
  serverColorMode,
  setColorMode,
  subscribeColorMode,
} from "./color-mode";

export function useColorMode() {
  const mode = useSyncExternalStore(
    subscribeColorMode,
    getColorMode,
    serverColorMode,
  );

  useLayoutEffect(() => {
    // Also restores the root attribute after a development Strict Mode remount.
    applyColorMode(getColorMode());
  }, []);

  return { mode, setMode: setColorMode };
}
