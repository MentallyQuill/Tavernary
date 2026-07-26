"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { copyKitLink, kitShareUrl } from "@/features/kits/share-kit";

export type KitShareFeedback =
  | { phase: "idle"; sequence: number }
  | { phase: "copied"; sequence: number }
  | { phase: "fallback"; sequence: number; url: string };

export function useKitShareFeedback(): {
  feedback: KitShareFeedback;
  copy: (kitId: string) => Promise<void>;
} {
  const sequence = useRef(0);
  const timer = useRef<number | null>(null);
  const [feedback, setFeedback] = useState<KitShareFeedback>({
    phase: "idle",
    sequence: 0,
  });

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const copy = useCallback(
    async (kitId: string) => {
      clearTimer();
      sequence.current += 1;
      const current = sequence.current;
      const result = await copyKitLink(kitId);
      if (current !== sequence.current) return;
      if (result === "fallback") {
        setFeedback({
          phase: "fallback",
          sequence: current,
          url: kitShareUrl(kitId),
        });
        return;
      }
      setFeedback({ phase: "copied", sequence: current });
      timer.current = window.setTimeout(() => {
        setFeedback({ phase: "idle", sequence: current });
        timer.current = null;
      }, 2_000);
    },
    [clearTimer],
  );

  return { feedback, copy };
}
