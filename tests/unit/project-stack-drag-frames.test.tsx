import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { useProjectStackDrag } from "@/features/kits/use-project-stack-drag";
import { animationFrames } from "../helpers/animation-frames";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function rectangle(top: number, height = 40) {
  return new DOMRect(0, top, 200, height);
}

function dragHarness(touchLayout = false) {
  const frames = animationFrames();
  const editor = document.createElement("form");
  const stack = document.createElement("ol");
  const handle = document.createElement("button");
  const rows = [0, 50, 100].map((top, index) => {
    const row = document.createElement("li");
    row.dataset.projectId = ["a", "b", "c"][index];
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(rectangle(top));
    stack.append(row);
    return row;
  });
  rows[0].append(handle);
  editor.append(stack);
  document.body.append(editor);
  vi.spyOn(editor, "getBoundingClientRect").mockReturnValue(rectangle(0, 300));
  vi.spyOn(handle, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 20, 40),
  );
  handle.setPointerCapture = vi.fn();
  handle.releasePointerCapture = vi.fn();
  const onReorder = vi.fn();
  const onRemove = vi.fn();
  const projectIds = ["a", "b", "c"];
  const hook = renderHook(
    ({ ids }) =>
      useProjectStackDrag({
        projectIds: ids,
        editorRef: { current: editor },
        stackRef: { current: stack },
        touchLayout,
        onReorder,
        onRemove,
      }),
    { initialProps: { ids: projectIds } },
  );
  act(() =>
    hook.result.current.begin(
      "a",
      {
        button: 0,
        pointerId: 1,
        clientX: 10,
        clientY: 10,
        currentTarget: handle,
      } as unknown as ReactPointerEvent<HTMLElement>,
      { reorderable: true },
    ),
  );
  return { ...hook, frames, rows, editor, handle, onReorder, onRemove };
}

function move(y: number, x = 10) {
  fireEvent.pointerMove(window, { pointerId: 1, clientX: x, clientY: y });
}

test("coalesces movement bursts and renders the latest pointer once per frame", () => {
  const { result, frames, rows } = dragHarness();
  vi.mocked(rows[1].getBoundingClientRect).mockClear();
  move(30);
  move(80);
  move(140);
  expect(rows[1].getBoundingClientRect).not.toHaveBeenCalled();
  expect(result.current.dragState?.phase).toBe("pressed");
  expect(frames.pendingCount).toBe(1);
  frames.flush();
  expect(result.current.dragState).toMatchObject({
    phase: "reorder",
    point: { x: 10, y: 140 },
    targetIndex: 2,
  });
  expect(rows[1].getBoundingClientRect).toHaveBeenCalledOnce();
});

test("release before the queued frame commits the release target and cancels that frame", () => {
  const { result, frames, onReorder, onRemove } = dragHarness();
  move(80);
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 10, clientY: 140 });
  expect(onReorder).toHaveBeenCalledExactlyOnceWith(["b", "c", "a"]);
  expect(onRemove).not.toHaveBeenCalled();
  expect(result.current.dragState).toBeNull();
  expect(frames.pendingCount).toBe(0);
  frames.flush();
  expect(onReorder).toHaveBeenCalledOnce();
  expect(result.current.dragState).toBeNull();
});

test("scroll remeasures the stack for a stationary pointer", () => {
  const { result, frames, rows } = dragHarness();
  move(80);
  frames.flush();
  expect(result.current.dragState?.targetIndex).toBe(1);
  vi.mocked(rows[2].getBoundingClientRect).mockReturnValue(rectangle(50));
  fireEvent.scroll(document);
  expect(frames.pendingCount).toBe(1);
  frames.flush();
  expect(result.current.dragState?.targetIndex).toBe(2);
});

test("changing project order cancels a pending drag instead of committing old indexes", () => {
  const { result, frames, rerender, onReorder } = dragHarness();
  move(140);
  rerender({ ids: ["c", "b", "a"] });
  expect(result.current.dragState).toBeNull();
  expect(frames.pendingCount).toBe(0);
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 10, clientY: 140 });
  frames.flush();
  expect(onReorder).not.toHaveBeenCalled();
});

test("a captured pointer returning to its origin before the frame remains an active drag", () => {
  const { result, frames } = dragHarness();
  move(140);
  move(10);
  frames.flush();
  expect(result.current.dragState?.phase).toBe("reorder");
  expect(result.current.dragState?.targetIndex).toBe(0);
});

test.each(["pointercancel", "Escape", "lostpointercapture"])(
  "%s cancels pending movement without committing it",
  (reason) => {
    const { result, frames, handle, onReorder, onRemove } = dragHarness();
    move(140, 250);
    expect(frames.pendingCount).toBe(1);
    if (reason === "Escape") fireEvent.keyDown(window, { key: "Escape" });
    else
      fireEvent(
        reason === "lostpointercapture" ? handle : window,
        new Event(reason),
      );
    expect(result.current.dragState).toBeNull();
    expect(frames.pendingCount).toBe(0);
    frames.flush();
    expect(onReorder).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  },
);

test("unmount cancels pending movement and removes viewport listeners", () => {
  const { frames, unmount, rows, onReorder, onRemove } = dragHarness();
  move(140);
  unmount();
  expect(frames.pendingCount).toBe(0);
  vi.mocked(rows[1].getBoundingClientRect).mockClear();
  frames.flush();
  fireEvent.scroll(window);
  fireEvent.resize(window);
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 10, clientY: 140 });
  expect(frames.pendingCount).toBe(0);
  expect(rows[1].getBoundingClientRect).not.toHaveBeenCalled();
  expect(onReorder).not.toHaveBeenCalled();
  expect(onRemove).not.toHaveBeenCalled();
});

test("release uses the new outside position even if the last queued move was inside", () => {
  const { frames, onReorder, onRemove } = dragHarness();
  move(80);
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 250, clientY: 80 });
  expect(onRemove).toHaveBeenCalledExactlyOnceWith("a");
  expect(onReorder).not.toHaveBeenCalled();
  expect(frames.pendingCount).toBe(0);
});

test("touch release outside the editor keeps reorder behavior", () => {
  const { frames, onReorder, onRemove } = dragHarness(true);
  move(140, 250);
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 250, clientY: 140 });
  expect(onReorder).toHaveBeenCalledExactlyOnceWith(["b", "c", "a"]);
  expect(onRemove).not.toHaveBeenCalled();
  expect(frames.pendingCount).toBe(0);
});

test("resize refreshes the editor boundary for a stationary pointer", () => {
  const { result, frames, editor } = dragHarness();
  move(140);
  frames.flush();
  expect(result.current.dragState?.phase).toBe("reorder");
  vi.mocked(editor.getBoundingClientRect).mockReturnValue(rectangle(0, 100));
  fireEvent.resize(window);
  frames.flush();
  expect(result.current.dragState?.phase).toBe("remove");
});

test("release without an activated movement does not capture an ended pointer or commit a drag", () => {
  const { result, handle, onReorder, onRemove } = dragHarness();
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 250, clientY: 140 });
  expect(handle.setPointerCapture).not.toHaveBeenCalled();
  expect(onReorder).not.toHaveBeenCalled();
  expect(onRemove).not.toHaveBeenCalled();
  expect(result.current.dragState).toBeNull();
});
