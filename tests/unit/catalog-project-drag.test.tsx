import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { expect, test, vi } from "vitest";

import { useCatalogProjectDrag } from "@/features/kits/use-catalog-project-drag";

test("activates at four pixels and drops only on a compatible Kit target", () => {
  const onDrop = vi.fn();
  const setPointerCapture = vi.fn();
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  });

  function Harness() {
    const editorRef = useRef<HTMLDivElement>(null);
    const drag = useCatalogProjectDrag({ editorRef, onDrop });
    return (
      <div ref={editorRef}>
        <button
          type="button"
          onPointerDown={(event) =>
            drag.begin(
              { id: "frontend-b", name: "Frontend B", kind: "frontend" },
              event,
            )
          }
        >
          Drag Frontend B
        </button>
        <div data-kit-drop-target="frontend">Frontend slot</div>
        <div data-kit-drop-target="stack">Stack</div>
        {drag.dragState ? <output>{drag.dragState.actionLabel}</output> : null}
      </div>
    );
  }

  render(<Harness />);
  const handle = screen.getByRole("button", { name: "Drag Frontend B" });
  const frontendTarget = screen.getByText("Frontend slot");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn().mockReturnValue(frontendTarget),
  });

  fireEvent.pointerDown(handle, {
    pointerId: 3,
    clientX: 10,
    clientY: 10,
  });
  fireEvent.pointerMove(window, {
    pointerId: 3,
    clientX: 13,
    clientY: 10,
  });
  expect(setPointerCapture).not.toHaveBeenCalled();
  fireEvent.pointerMove(window, {
    pointerId: 3,
    clientX: 14,
    clientY: 10,
  });
  expect(setPointerCapture).toHaveBeenCalledWith(3);
  expect(screen.getByText("Release to add")).toBeVisible();
  fireEvent.pointerUp(window, { pointerId: 3 });
  expect(onDrop).toHaveBeenCalledOnce();
  expect(onDrop).toHaveBeenCalledWith("frontend-b", "frontend");
});
