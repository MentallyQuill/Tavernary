import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ProjectSelectionDock } from "@/features/kits/components/project-selection-dock";

afterEach(cleanup);

describe("ProjectSelectionDock", () => {
  test("shows the selected tally and concise primary action", () => {
    render(
      <ProjectSelectionDock
        selectedCount={3}
        replacementFrontendName={null}
        limitReached={false}
        onCancel={() => undefined}
        onAdd={() => undefined}
      />,
    );

    expect(
      screen.getByRole("region", { name: "3 projects selected" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add 3 projects to Kit" }),
    ).toBeEnabled();
    expect(screen.getByText("3")).toHaveClass("selection-count");
  });

  test("uses singular project copy in the primary accessible name", () => {
    render(
      <ProjectSelectionDock
        selectedCount={1}
        replacementFrontendName={null}
        limitReached={false}
        onCancel={() => undefined}
        onAdd={() => undefined}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Add 1 project to Kit" }),
    ).toBeEnabled();
  });

  test("presents Frontend replacement and capacity guidance", () => {
    render(
      <ProjectSelectionDock
        selectedCount={3}
        replacementFrontendName="Frontend A"
        limitReached
        onCancel={() => undefined}
        onAdd={() => undefined}
      />,
    );

    expect(screen.getByText("Frontend will replace Frontend A")).toBeVisible();
    expect(screen.getByText("Kit limit reached · 50 projects")).toBeVisible();
  });

  test("reports when the current selection cannot add anything", () => {
    render(
      <ProjectSelectionDock
        selectedCount={1}
        replacementFrontendName={null}
        limitReached={false}
        nothingCanBeAdded
        onCancel={() => undefined}
        onAdd={() => undefined}
      />,
    );

    expect(screen.getByText("Nothing can be added")).toBeVisible();
  });

  test("routes Cancel and Add to their corresponding handlers", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onAdd = vi.fn();
    render(
      <ProjectSelectionDock
        selectedCount={2}
        replacementFrontendName={null}
        limitReached={false}
        onCancel={onCancel}
        onAdd={onAdd}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onAdd).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Add 2 projects to Kit" }),
    );
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test("disables Add to Kit when the selection is empty", () => {
    render(
      <ProjectSelectionDock
        selectedCount={0}
        replacementFrontendName={null}
        limitReached={false}
        onCancel={() => undefined}
        onAdd={() => undefined}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Add 0 projects to Kit" }),
    ).toBeDisabled();
  });
});
