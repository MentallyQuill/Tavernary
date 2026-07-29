import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { PermanentDelistDialog } from "@/features/help/components/permanent-delist-dialog";

afterEach(() => {
  cleanup();
  document.body.className = "";
});

test("requires the complete project name before permanent delisting", async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();
  const onConfirm = vi.fn();

  render(
    <PermanentDelistDialog
      projectName="Owner Extension"
      repositoryLabel="CurrentOwner/Extension"
      open
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );

  expect(
    screen.getByRole("heading", {
      name: "Permanently delist Owner Extension?",
    }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "You are about to remove Owner Extension from Tavernary. This delisting applies to CurrentOwner/Extension.",
    ),
  ).toBeVisible();
  expect(
    screen.getByText(
      "The project will be removed from the public catalog. You will not be able to reverse this decision or resubmit the project. Kits containing this project may also be affected.",
    ),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

  const confirm = screen.getByRole("button", {
    name: "Permanently delist project",
  });
  const projectName = screen.getByLabelText(
    "Type Owner Extension to confirm permanent delisting.",
  );
  expect(confirm).toBeDisabled();

  await user.type(projectName, "Owner");
  expect(confirm).toBeDisabled();

  await user.clear(projectName);
  await user.type(projectName, "  owner extension  ");
  expect(confirm).toBeEnabled();
  expect(
    screen.getByText(
      "Project name matches. Permanent delisting is now available.",
    ),
  ).toHaveAttribute("aria-live", "polite");

  await user.type(projectName, "!");
  expect(confirm).toBeDisabled();
  expect(
    screen.queryByText(
      "Project name matches. Permanent delisting is now available.",
    ),
  ).not.toBeInTheDocument();
});
