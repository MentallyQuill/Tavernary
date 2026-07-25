"use client";

import { useEffect, useRef, useState } from "react";

type MotionPhase = "entering" | "entered" | "exiting";

export function useTransitionPresence(visible: boolean, durationMs: number) {
  const [state, setState] = useState<{
    present: boolean;
    phase: MotionPhase;
  }>(() => ({
    present: visible,
    phase: visible ? "entering" : "exiting",
  }));
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    if (visible) {
      setState({ present: true, phase: "entering" });
      if (reducedMotion) {
        setState({ present: true, phase: "entered" });
      } else {
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          setState({ present: true, phase: "entered" });
        });
      }
    } else if (reducedMotion) {
      setState({ present: false, phase: "exiting" });
    } else {
      setState((current) => ({
        present: current.present,
        phase: "exiting",
      }));
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setState({ present: false, phase: "exiting" });
      }, durationMs);
    }

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [durationMs, visible]);

  return state;
}
