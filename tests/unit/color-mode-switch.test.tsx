import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ColorModeSwitch } from "@/features/accessibility/components/color-mode-switch";

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-color-mode");
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

test("enables colorblind mode with its switch", async () => {
  const user = userEvent.setup();
  render(<ColorModeSwitch />);
  const toggle = screen.getByRole("switch", { name: "Colorblind mode" });

  expect(toggle).toHaveAttribute("aria-checked", "false");
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(document.documentElement).toHaveAttribute(
    "data-color-mode",
    "accessible",
  );
});

test("toggles colorblind mode with Space and Enter", async () => {
  const user = userEvent.setup();
  render(<ColorModeSwitch />);
  const toggle = screen.getByRole("switch", { name: "Colorblind mode" });

  await user.tab();
  expect(toggle).toHaveFocus();
  await user.keyboard("[Space]");
  expect(toggle).toHaveAttribute("aria-checked", "true");

  await user.keyboard("{Enter}");
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(document.documentElement).toHaveAttribute(
    "data-color-mode",
    "standard",
  );
});
