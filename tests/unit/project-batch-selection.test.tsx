import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function emptyPlan(): KitBatchPlan {
  return {
    projectIds: [],
    addedProjectIds: [],
    skippedProjectIds: [],
    replacedFrontendId: null,
    limitReached: false,
  };
}

function Harness({
  active = true,
  draftProjectIds = [],
  availableProjects = fixtureProjects,
  onApply = emptyPlan,
  onFirstSelection = vi.fn(),
  onSelectionEmpty = vi.fn(),
  onRemoveFromDraft = vi.fn(() => true),
  onStatus = vi.fn(),
}: {
  active?: boolean;
  draftProjectIds?: string[];
  availableProjects?: CatalogProject[];
  onApply?: (projectIds: string[]) => KitBatchPlan;
  onFirstSelection?: () => void;
  onSelectionEmpty?: () => void;
  onRemoveFromDraft?: (projectId: string) => boolean;
  onStatus?: (message: string) => void;
}) {
  const selection = useProjectBatchSelection({
    projects: availableProjects,
    draftProjectIds,
    active,
    onApply,
    onFirstSelection,
    onSelectionEmpty,
    onRemoveFromDraft,
    onStatus,
  });

  return (
    <>
      {["memory", "preset", "frontend-a", "frontend-b"].map((projectId) => {
        const bindings = selection.bindingsFor(projectId);
        return (
          <button
            key={projectId}
            type="button"
            aria-label={`Toggle ${projectId}`}
            aria-pressed={bindings.state !== "available"}
            disabled={bindings.disabled}
            onClick={bindings.onActivate}
          >
            {bindings.state}
          </button>
        );
      })}
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
      <output aria-label="Selected Frontend">
        {selection.selectedFrontendName ?? ""}
      </output>
      <button type="button" onClick={() => selection.apply()}>
        Apply
      </button>
      <button type="button" onClick={selection.clear}>
        Clear
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("uses one explicit activation path for select and deselect", async () => {
  const user = userEvent.setup();
  const onFirstSelection = vi.fn();
  const onSelectionEmpty = vi.fn();
  const onStatus = vi.fn();
  render(
    <Harness
      onFirstSelection={onFirstSelection}
      onSelectionEmpty={onSelectionEmpty}
      onStatus={onStatus}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Toggle memory" }));
  expect(onFirstSelection).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("1");
  expect(
    screen.getByRole("button", { name: "Toggle memory" }),
  ).toHaveTextContent("selected");
  expect(onStatus).toHaveBeenLastCalledWith("Memory selected");

  await user.click(screen.getByRole("button", { name: "Toggle memory" }));
  expect(onSelectionEmpty).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("0");
  expect(onStatus).toHaveBeenLastCalledWith("Memory removed from selection");
});

test("removes an In-Kit project instead of selecting it", async () => {
  const user = userEvent.setup();
  const onRemoveFromDraft = vi.fn(() => true);
  const onStatus = vi.fn();
  render(
    <Harness
      draftProjectIds={["memory"]}
      onRemoveFromDraft={onRemoveFromDraft}
      onStatus={onStatus}
    />,
  );

  const memory = screen.getByRole("button", { name: "Toggle memory" });
  expect(memory).toHaveTextContent("in-kit");
  await user.click(memory);

  expect(onRemoveFromDraft).toHaveBeenCalledWith("memory");
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("0");
  expect(onStatus).toHaveBeenCalledWith("Memory removed from Kit");
});

test("does not announce failed In-Kit removal", async () => {
  const user = userEvent.setup();
  const onStatus = vi.fn();
  render(
    <Harness
      draftProjectIds={["memory"]}
      onRemoveFromDraft={() => false}
      onStatus={onStatus}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Toggle memory" }));

  expect(onStatus).not.toHaveBeenCalled();
});

test("Escape and Clear empty the current selection once", async () => {
  const user = userEvent.setup();
  const onSelectionEmpty = vi.fn();
  render(<Harness onSelectionEmpty={onSelectionEmpty} />);

  await user.click(screen.getByRole("button", { name: "Toggle memory" }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("0");
  expect(onSelectionEmpty).toHaveBeenCalledOnce();

  await user.click(screen.getByRole("button", { name: "Clear" }));
  expect(onSelectionEmpty).toHaveBeenCalledOnce();
});

test("swaps the selected Frontend instead of selecting two", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "Toggle frontend-a" }));
  await user.click(screen.getByRole("button", { name: "Toggle frontend-b" }));

  expect(
    screen.getByRole("button", { name: "Toggle frontend-a" }),
  ).toHaveTextContent("available");
  expect(
    screen.getByRole("button", { name: "Toggle frontend-b" }),
  ).toHaveTextContent("selected");
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("1");
  expect(screen.getByLabelText("Selected Frontend")).toHaveTextContent(
    "Frontend B",
  );
});

test("reports the draft Frontend that selection will replace", async () => {
  const user = userEvent.setup();
  render(<Harness draftProjectIds={["frontend-a"]} />);

  await user.click(screen.getByRole("button", { name: "Toggle frontend-b" }));

  expect(screen.getByLabelText("Replacement Frontend")).toHaveTextContent(
    "Frontend A",
  );
  expect(screen.getByLabelText("Selected Frontend")).toHaveTextContent(
    "Frontend B",
  );
});

test("disables additions when the draft has reached 50 projects", () => {
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

  expect(screen.getByRole("button", { name: "Toggle memory" })).toBeDisabled();
});

test("allows a Frontend replacement when the draft has 50 projects", () => {
  const fullDraft = [
    "frontend-a",
    ...Array.from({ length: 49 }, (_, index) => `draft-${index}`),
  ];
  const availableProjects = [
    ...fixtureProjects,
    ...fullDraft
      .filter((id) => id !== "frontend-a")
      .map((id) => ({ id, kind: "extension" as const })),
  ] as CatalogProject[];
  render(
    <Harness
      draftProjectIds={fullDraft}
      availableProjects={availableProjects}
    />,
  );

  expect(
    screen.getByRole("button", { name: "Toggle frontend-b" }),
  ).toBeEnabled();
});

test("applies selected IDs once and clears transient selection", async () => {
  const user = userEvent.setup();
  const onApply = vi.fn((selectedProjectIds: string[]): KitBatchPlan => ({
    projectIds: selectedProjectIds,
    addedProjectIds: selectedProjectIds,
    skippedProjectIds: [],
    replacedFrontendId: null,
    limitReached: false,
  }));
  render(<Harness onApply={onApply} />);
  await user.click(screen.getByRole("button", { name: "Toggle memory" }));

  await user.click(screen.getByRole("button", { name: "Apply" }));

  expect(onApply).toHaveBeenCalledOnce();
  expect(onApply).toHaveBeenCalledWith(["memory"]);
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("0");
});

test("retains selection when an applied batch adds nothing", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Toggle memory" }));

  await user.click(screen.getByRole("button", { name: "Apply" }));

  expect(screen.getByLabelText("Selected count")).toHaveTextContent("1");
  expect(screen.getByLabelText("Nothing can be added")).toHaveTextContent(
    "yes",
  );
});

test("clears selection when project browsing becomes inactive", async () => {
  const user = userEvent.setup();
  const onSelectionEmpty = vi.fn();
  const { rerender } = render(<Harness onSelectionEmpty={onSelectionEmpty} />);
  await user.click(screen.getByRole("button", { name: "Toggle memory" }));

  rerender(<Harness active={false} onSelectionEmpty={onSelectionEmpty} />);

  expect(screen.getByLabelText("Selected count")).toHaveTextContent("0");
  await waitFor(() => expect(onSelectionEmpty).toHaveBeenCalledOnce());
});
