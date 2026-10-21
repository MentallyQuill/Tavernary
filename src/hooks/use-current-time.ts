"use client";

import { useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;

function currentMinute() {
  // A stable snapshot within each minute avoids continuous re-renders.
  return new Date(Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS).toISOString();
}

function subscribe(listener: () => void) {
  const timer = window.setInterval(listener, MINUTE_MS);
  return () => window.clearInterval(timer);
}

export function useCurrentTime(serverTime: string) {
  // Match the static HTML during hydration, then read the browser clock.
  return useSyncExternalStore(subscribe, currentMinute, () => serverTime);
}
