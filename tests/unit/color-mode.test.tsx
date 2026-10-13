import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  COLOR_MODE_BOOTSTRAP,
  setColorMode,
} from "@/features/accessibility/color-mode";
import { useColorMode } from "@/features/accessibility/use-color-mode";

beforeEach(() => {
  setColorMode("standard");
  localStorage.clear();
  document.documentElement.removeAttribute("data-color-mode");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setColorMode("standard");
  localStorage.clear();
});

test("restores saved colorblind colors before the page hydrates", () => {
  localStorage.setItem("tavernary:color-mode", "accessible");
  window.eval(COLOR_MODE_BOOTSTRAP);
  expect(document.documentElement).toHaveAttribute(
    "data-color-mode",
    "accessible",
  );
});

test("persists a changed color mode and restores it on the next visit", () => {
  const firstVisit = renderHook(() => useColorMode());
  act(() => firstVisit.result.current.setMode("accessible"));
  expect(localStorage.getItem("tavernary:color-mode")).toBe("accessible");
  expect(document.documentElement).toHaveAttribute(
    "data-color-mode",
    "accessible",
  );
  firstVisit.unmount();
  const nextVisit = renderHook(() => useColorMode());
  expect(nextVisit.result.current.mode).toBe("accessible");
});

test("updates the current page when the preference changes in another tab", () => {
  const page = renderHook(() => useColorMode());
  act(() => {
    localStorage.setItem("tavernary:color-mode", "accessible");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "tavernary:color-mode",
        newValue: "accessible",
        storageArea: localStorage,
      }),
    );
  });
  expect(page.result.current.mode).toBe("accessible");
  expect(document.documentElement).toHaveAttribute(
    "data-color-mode",
    "accessible",
  );
});

test.each([null, "invalid", "false"])(
  "keeps the red default for an absent or invalid saved mode: %s",
  (value) => {
    if (value !== null) localStorage.setItem("tavernary:color-mode", value);
    window.eval(COLOR_MODE_BOOTSTRAP);
    expect(document.documentElement).toHaveAttribute(
      "data-color-mode",
      "standard",
    );
    const page = renderHook(() => useColorMode());
    expect(page.result.current.mode).toBe("standard");
  },
);

test("keeps the switch usable when the browser blocks storage", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  expect(() => window.eval(COLOR_MODE_BOOTSTRAP)).not.toThrow();
  const page = renderHook(() => useColorMode());
  act(() => page.result.current.setMode("accessible"));
  expect(page.result.current.mode).toBe("accessible");
  expect(document.documentElement).toHaveAttribute(
    "data-color-mode",
    "accessible",
  );
  act(() => page.result.current.setMode("standard"));
  expect(page.result.current.mode).toBe("standard");
});

test("keeps the current choice when storage reads work but writes fail", () => {
  localStorage.setItem("tavernary:color-mode", "standard");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  const page = renderHook(() => useColorMode());
  act(() => page.result.current.setMode("accessible"));
  expect(page.result.current.mode).toBe("accessible");
  expect(document.documentElement).toHaveAttribute(
    "data-color-mode",
    "accessible",
  );
});

test("returns to the red default when saved browser preferences are cleared", () => {
  localStorage.setItem("tavernary:color-mode", "accessible");
  const page = renderHook(() => useColorMode());
  act(() => {
    localStorage.clear();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: null,
        newValue: null,
        storageArea: localStorage,
      }),
    );
  });
  expect(page.result.current.mode).toBe("standard");
  expect(document.documentElement).toHaveAttribute(
    "data-color-mode",
    "standard",
  );
});
