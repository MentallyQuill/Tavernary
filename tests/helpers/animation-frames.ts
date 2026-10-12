import { act } from "@testing-library/react";
import { vi } from "vitest";

/** A controllable browser frame boundary; canceled callbacks cannot run. */
export function animationFrames() {
  let nextId = 0;
  const pending = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    pending.set(++nextId, callback);
    return nextId;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    pending.delete(id);
  });
  return {
    get pendingCount() {
      return pending.size;
    },
    flush() {
      act(() => {
        const callbacks = [...pending.values()];
        pending.clear();
        callbacks.forEach((callback) => callback(0));
      });
    },
  };
}
