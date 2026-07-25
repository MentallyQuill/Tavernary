"use client";

import { useEffect, useRef, useState } from "react";

type MotionPhase = "entering" | "entered" | "exiting";
type PresenceState = {
  observedVisible: boolean;
  present: boolean;
  phase: MotionPhase;
};

export function useTransitionPresence(visible: boolean, durationMs: number) {
  const [state, setState] = useState<PresenceState>(() => ({
    observedVisible: visible,
    present: visible,
    phase: visible ? "entering" : "exiting",
  }));
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (state.observedVisible !== visible) {
    setState({
      observedVisible: visible,
      present: visible || state.present,
      phase: visible ? "entering" : "exiting",
    });
  }

  useEffect(() => {
    let cancelled = false;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    if (visible) {
      const finishEntry = () => {
        if (cancelled) return;
        setState((current) =>
          current.observedVisible
            ? { ...current, present: true, phase: "entered" }
            : current,
        );
      };
      if (reducedMotion) {
        queueMicrotask(finishEntry);
      } else {
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          finishEntry();
        });
      }
    } else {
      const finishExit = () => {
        if (cancelled) return;
        setState((current) =>
          current.observedVisible
            ? current
            : { ...current, present: false, phase: "exiting" },
        );
      };
      if (reducedMotion) {
        queueMicrotask(finishExit);
      } else {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          finishExit();
        }, durationMs);
      }
    }

    return () => {
      cancelled = true;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [durationMs, visible]);

  return { present: state.present, phase: state.phase };
}
