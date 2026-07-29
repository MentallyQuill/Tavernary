import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { PermanentDelistDialog } from "@/features/help/components/permanent-delist-dialog";

afterEach(() => {
  cleanup();
  document.body.className = "";
});

test("requires the repository identity and lists every affected card", async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();
  const onConfirm = vi.fn();

  render(
    <PermanentDelistDialog
      repository="Owner/Alpha"
      cards={[
        { id: "alpha", name: "Alpha" },
        { id: "alpha-preset", name: "Alpha Preset" },
      ]}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );

  expect(
    screen.getByRole("heading", {
      name: "Permanently delist Owner/Alpha?",
    }),
  ).toBeVisible();
  expect(screen.getByText("Alpha")).toBeVisible();
  expect(screen.getByText("Alpha Preset")).toBeVisible();
  expect(
    screen.getByText(
      "Adding, editing, retiring, and restoring individual cards are normal maintenance. Delisting the source is not reversible.",
    ),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

  const confirm = screen.getByRole("button", {
    name: "Permanently delist source",
  });
  const repository = screen.getByLabelText(
    "Type Owner/Alpha to confirm permanent delisting.",
  );
  expect(confirm).toBeDisabled();

  await user.type(repository, "Owner");
  expect(confirm).toBeDisabled();
  await user.clear(repository);
  await user.type(repository, "  owner/alpha  ");
  expect(confirm).toBeEnabled();
  expect(
    screen.getByText(
      "Repository matches. Permanent delisting is now available.",
    ),
  ).toHaveAttribute("aria-live", "polite");

  await user.click(confirm);
  expect(onConfirm).toHaveBeenCalledWith("  owner/alpha  ");
});
