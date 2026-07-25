import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { KitBatchPlan } from "@/features/kits/project-batch";
import { useProjectBatchSelection } from "@/features/kits/use-project-batch-selection";

const fixtureProjects = [
  { id: "memory", name: "Memory", kind: "extension" },
  { id: "preset", name: "Preset", kind: "preset" },
  { id: "frontend-a", name: "Frontend A", kind: "frontend" },
  { id: "frontend-b", name: "Frontend B", kind: "frontend" },
] as CatalogProject[];

function Harness({
  active = true,
  draftProjectIds = [],
  availableProjects = fixtureProjects,
  onApply = () => ({
    projectIds: [],
    addedProjectIds: [],
    skippedProjectIds: [],
    replacedFrontendId: null,
    limitReached: false,
  }),
}: {
  active?: boolean;
  draftProjectIds?: string[];
  availableProjects?: CatalogProject[];
  onApply?: (projectIds: string[]) => KitBatchPlan;
}) {
  const selection = useProjectBatchSelection({
    projects: availableProjects,
    draftProjectIds,
    active,
    onApply,
  });
  const bindings = selection.bindingsFor("memory");
  const presetBindings = selection.bindingsFor("preset");
  const frontendABindings = selection.bindingsFor("frontend-a");
  const frontendBBindings = selection.bindingsFor("frontend-b");

  return (
    <>
      <div
        data-testid="memory"
        tabIndex={0}
        aria-selected={bindings.selected}
        onPointerDown={bindings.onPointerDown}
        onPointerMove={bindings.onPointerMove}
        onPointerUp={bindings.onPointerUp}
        onPointerCancel={bindings.onPointerCancel}
        onClick={bindings.onClick}
        onKeyDown={bindings.onKeyDown}
      >
        <button type="button" data-project-drag-handle>
          Drag
        </button>
      </div>
      <div
        data-testid="preset"
        tabIndex={0}
        aria-selected={presetBindings.selected}
        onPointerDown={presetBindings.onPointerDown}
        onPointerMove={presetBindings.onPointerMove}
        onPointerUp={presetBindings.onPointerUp}
        onPointerCancel={presetBindings.onPointerCancel}
        onClick={presetBindings.onClick}
        onKeyDown={presetBindings.onKeyDown}
      />
      <div
        data-testid="frontend-a"
        tabIndex={0}
        aria-selected={frontendABindings.selected}
        onClick={frontendABindings.onClick}
        onKeyDown={frontendABindings.onKeyDown}
      />
      <div
        data-testid="frontend-b"
        tabIndex={0}
        aria-selected={frontendBBindings.selected}
        onClick={frontendBBindings.onClick}
        onKeyDown={frontendBBindings.onKeyDown}
      />
      <output aria-label="Selected count">{selection.selectedCount}</output>
      <output aria-label="Limit reached">
        {selection.limitReached ? "yes" : "no"}
      </output>
      <output aria-label="Nothing can be added">
        {selection.nothingCanBeAdded ? "yes" : "no"}
      </output>
      <output aria-label="Replacement Frontend">
        {selection.replacementFrontendName ?? ""}
      </output>
      <button type="button" onClick={() => selection.apply()}>
        Apply
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("selects a project after a 450ms press", () => {
  vi.useFakeTimers();
  render(<Harness />);
  const card = screen.getByTestId("memory");

  fireEvent.pointerDown(card, {
    pointerId: 1,
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  act(() => vi.advanceTimersByTime(449));
  expect(card).toHaveAttribute("aria-selected", "false");
  act(() => vi.advanceTimersByTime(1));
  expect(card).toHaveAttribute("aria-selected", "true");
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("1");
});

test("cancels a press after more than eight pixels of movement", () => {
  vi.useFakeTimers();
  render(<Harness />);
  const card = screen.getByTestId("memory");

  fireEvent.pointerDown(card, {
    pointerId: 1,
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(card, {
    pointerId: 1,
    clientX: 109,
    clientY: 100,
  });
  act(() => vi.advanceTimersByTime(450));

  expect(card).toHaveAttribute("aria-selected", "false");
});

test("cancels a pending press when the page scrolls", () => {
  vi.useFakeTimers();
  render(<Harness />);
  const card = screen.getByTestId("memory");

  fireEvent.pointerDown(card, {
    pointerId: 1,
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.scroll(window);
  act(() => vi.advanceTimersByTime(450));

  expect(card).toHaveAttribute("aria-selected", "false");
});

test("does not start selection from a project drag handle", () => {
  vi.useFakeTimers();
  render(<Harness />);
  const card = screen.getByTestId("memory");

  fireEvent.pointerDown(screen.getByRole("button", { name: "Drag" }), {
    pointerId: 1,
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  act(() => vi.advanceTimersByTime(450));

  expect(card).toHaveAttribute("aria-selected", "false");
});

test("does not toggle active selection from a drag handle", () => {
  render(<Harness />);
  const memory = screen.getByTestId("memory");
  const dragHandle = screen.getByRole("button", { name: "Drag" });

  fireEvent.keyDown(screen.getByTestId("preset"), { key: " " });
  fireEvent.click(dragHandle);
  expect(memory).toHaveAttribute("aria-selected", "false");

  fireEvent.keyDown(dragHandle, { key: " " });
  expect(memory).toHaveAttribute("aria-selected", "false");
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("1");
});

test("acknowledges activation and consumes the follow-up click", () => {
  vi.useFakeTimers();
  const vibrate = vi.fn();
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  render(<Harness />);
  const card = screen.getByTestId("memory");

  fireEvent.pointerDown(card, {
    pointerId: 1,
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  act(() => vi.advanceTimersByTime(450));
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  card.dispatchEvent(click);

  expect(vibrate).toHaveBeenCalledWith(10);
  expect(click.defaultPrevented).toBe(true);
});

test("uses ordinary clicks to toggle projects after selection starts", () => {
  vi.useFakeTimers();
  render(<Harness />);
  const memory = screen.getByTestId("memory");
  const preset = screen.getByTestId("preset");

  fireEvent.pointerDown(memory, {
    pointerId: 1,
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  act(() => vi.advanceTimersByTime(450));
  fireEvent.click(memory);
  fireEvent.click(preset);
  expect(preset).toHaveAttribute("aria-selected", "true");
  fireEvent.click(memory);

  expect(memory).toHaveAttribute("aria-selected", "false");
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("1");
});

test("supports Space, Enter, and Escape selection controls", () => {
  render(<Harness />);
  const memory = screen.getByTestId("memory");
  const preset = screen.getByTestId("preset");

  fireEvent.keyDown(memory, { key: " " });
  expect(memory).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(preset, { key: "Enter" });
  expect(preset).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(window, { key: "Escape" });

  expect(memory).toHaveAttribute("aria-selected", "false");
  expect(preset).toHaveAttribute("aria-selected", "false");
});

test("swaps the selected Frontend instead of selecting two", () => {
  render(<Harness />);
  const frontendA = screen.getByTestId("frontend-a");
  const frontendB = screen.getByTestId("frontend-b");

  fireEvent.keyDown(frontendA, { key: " " });
  fireEvent.click(frontendB);

  expect(frontendA).toHaveAttribute("aria-selected", "false");
  expect(frontendB).toHaveAttribute("aria-selected", "true");
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("1");
});

test("does not select projects already present in the draft", () => {
  render(<Harness draftProjectIds={["memory"]} />);
  const memory = screen.getByTestId("memory");

  fireEvent.keyDown(memory, { key: " " });

  expect(memory).toHaveAttribute("aria-selected", "false");
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("0");
});

test("stops selection when the draft has reached 50 projects", () => {
  const fullDraft = Array.from({ length: 50 }, (_, index) => `draft-${index}`);
  const availableProjects = [
    ...fixtureProjects,
    ...fullDraft.map((id) => ({ id, kind: "extension" as const })),
  ] as CatalogProject[];
  render(
    <Harness
      draftProjectIds={fullDraft}
      availableProjects={availableProjects}
    />,
  );
  const memory = screen.getByTestId("memory");

  fireEvent.keyDown(memory, { key: " " });

  expect(memory).toHaveAttribute("aria-selected", "false");
  expect(screen.getByLabelText("Limit reached")).toHaveTextContent("yes");
});

test("reports the draft Frontend that selection will replace", () => {
  render(<Harness draftProjectIds={["frontend-a"]} />);

  fireEvent.keyDown(screen.getByTestId("frontend-b"), { key: " " });

  expect(screen.getByLabelText("Replacement Frontend")).toHaveTextContent(
    "Frontend A",
  );
});

test("applies selected IDs once and clears transient selection", () => {
  const onApply = vi.fn((selectedProjectIds: string[]): KitBatchPlan => ({
    projectIds: selectedProjectIds,
    addedProjectIds: selectedProjectIds,
    skippedProjectIds: [],
    replacedFrontendId: null,
    limitReached: false,
  }));
  render(<Harness onApply={onApply} />);
  fireEvent.keyDown(screen.getByTestId("memory"), { key: " " });

  fireEvent.click(screen.getByRole("button", { name: "Apply" }));

  expect(onApply).toHaveBeenCalledOnce();
  expect(onApply).toHaveBeenCalledWith(["memory"]);
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("0");
});

test("retains selection and reports when an applied batch adds nothing", () => {
  render(<Harness />);
  fireEvent.keyDown(screen.getByTestId("memory"), { key: " " });

  fireEvent.click(screen.getByRole("button", { name: "Apply" }));

  expect(screen.getByLabelText("Selected count")).toHaveTextContent("1");
  expect(screen.getByLabelText("Nothing can be added")).toHaveTextContent(
    "yes",
  );
});

test("clears selection when All Projects becomes inactive", () => {
  const { rerender } = render(<Harness />);
  fireEvent.keyDown(screen.getByTestId("memory"), { key: " " });
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("1");

  rerender(<Harness active={false} />);

  expect(screen.getByLabelText("Selected count")).toHaveTextContent("0");
});
