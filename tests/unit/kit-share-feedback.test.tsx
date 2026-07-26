import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { KitShareNotice } from "@/features/kits/components/kit-share-notice";
import { useKitShareFeedback } from "@/features/kits/use-kit-share-feedback";

function Harness() {
  const share = useKitShareFeedback();
  return (
    <>
      <button type="button" onClick={() => void share.copy("story-kit-41")}>
        Copy
      </button>
      <KitShareNotice feedback={share.feedback} />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("shows one success notice for 2000ms", async () => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  render(<Harness />);

  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await act(async () => undefined);
  expect(
    screen.getByRole("status", { name: "Kit URL copied to clipboard" }),
  ).toBeVisible();

  act(() => vi.advanceTimersByTime(1999));
  expect(screen.getByRole("status")).toBeVisible();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("repeated copy replaces the notice and restarts its timer", async () => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  render(<Harness />);

  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await act(async () => undefined);
  act(() => vi.advanceTimersByTime(1500));
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await act(async () => undefined);

  expect(screen.getAllByRole("status")).toHaveLength(1);
  act(() => vi.advanceTimersByTime(1999));
  expect(screen.getByRole("status")).toBeVisible();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("clipboard failure exposes and selects the share URL", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  render(<Harness />);

  await userEvent.click(screen.getByRole("button", { name: "Copy" }));

  expect(
    screen.getByRole("status", {
      name: "Couldn't copy automatically. Select the URL below.",
    }),
  ).toBeVisible();
  const input = screen.getByRole("textbox", {
    name: "Kit link",
  }) as HTMLInputElement;
  expect(input.value).toContain("mode=kits&kit=story-kit-41");
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
});

test("clears an active success timer on unmount", async () => {
  vi.useFakeTimers();
  const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  const { unmount } = render(<Harness />);

  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await act(async () => undefined);
  unmount();

  expect(clearTimeoutSpy).toHaveBeenCalled();
});
