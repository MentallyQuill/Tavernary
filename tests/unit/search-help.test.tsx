import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";

import { SearchHelp } from "@/features/search/components/search-help";

afterEach(cleanup);

test("opens the approved search instructions and toggles closed", async () => {
  const user = userEvent.setup();
  render(<SearchHelp />);
  const trigger = screen.getByRole("button", { name: "Search help" });

  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");

  const dialog = screen.getByRole("dialog", { name: "Search basics" });
  expect(dialog).toHaveTextContent("A B");
  expect(dialog).toHaveTextContent("matches results containing A and B");
  expect(dialog).toHaveTextContent("A+B");
  expect(dialog).toHaveTextContent("matches results containing A or B");
  expect(dialog).toHaveTextContent("A+B C");
  expect(dialog).toHaveTextContent("matches A, or both B and C");
  expect(dialog).toHaveTextContent(
    "Search-result URLs can be copied and shared",
  );
  expect(dialog).toHaveTextContent(
    "Press / anywhere on the page to jump to search",
  );

  await user.click(trigger);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("dismisses outside and restores trigger focus after Escape", async () => {
  const user = userEvent.setup();
  render(
    <>
      <SearchHelp />
      <button type="button">Outside</button>
    </>,
  );
  const trigger = screen.getByRole("button", { name: "Search help" });

  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Outside" }));
  expect(screen.queryByRole("dialog")).toBeNull();

  await user.click(trigger);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
});
