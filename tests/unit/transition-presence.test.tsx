import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { useTransitionPresence } from "@/hooks/use-transition-presence";

afterEach(() => {
  vi.useRealTimers();
});

test("keeps an exiting surface present through its motion duration", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(
    ({ visible }) => useTransitionPresence(visible, 220),
    { initialProps: { visible: true } },
  );

  expect(result.current).toEqual({ present: true, phase: "entering" });
  act(() => vi.advanceTimersByTime(16));
  expect(result.current).toEqual({ present: true, phase: "entered" });

  rerender({ visible: false });
  expect(result.current).toEqual({ present: true, phase: "exiting" });
  act(() => vi.advanceTimersByTime(219));
  expect(result.current.present).toBe(true);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.present).toBe(false);
});
