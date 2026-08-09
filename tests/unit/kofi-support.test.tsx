import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { KoFiSupport } from "@/features/catalog/components/kofi-support";

afterEach(() => cleanup());

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

test("links the header support action to Tavernary's transparency page", () => {
  render(<KoFiSupport />);

  const support = screen.getByRole("link", {
    name: "Support Tavernary on Ko-fi",
  });
  expect(support).toHaveAttribute("href", "/support");
  expect(support).toHaveTextContent("Support Tavernary");
  expect(support.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("uses Tavernary's shared desktop tooltip", async () => {
  const user = userEvent.setup();
  render(<KoFiSupport />);

  const support = screen.getByRole("link", {
    name: "Support Tavernary on Ko-fi",
  });
  await user.hover(support);

  expect(
    screen.getByRole("tooltip", { name: "Support Tavernary on Ko-fi" }),
  ).toBeInTheDocument();
});
