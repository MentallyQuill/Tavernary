import { cleanup, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SiteHeader } from "@/features/catalog/components/site-header";

vi.mock("next/image", () => ({
  default: () => null,
}));

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

test("keeps site actions available without asking visitors for donations", () => {
  render(
    <SiteHeader
      search=""
      onSearch={() => undefined}
      searchRef={createRef<HTMLInputElement>()}
    />,
  );

  const actions = within(
    screen.getByRole("navigation", { name: "Site actions" }),
  );
  expect(actions.getByRole("link", { name: "About" })).toBeInTheDocument();
  expect(actions.getByRole("link", { name: "Menu" })).toHaveAttribute(
    "href",
    "/menu",
  );
  expect(actions.queryByRole("link", { name: "Help" })).toBeNull();
  expect(
    actions.getByRole("link", { name: "Submit Project" }),
  ).toBeInTheDocument();
  expect(actions.queryByRole("link", { name: /ko-fi|donat/i })).toBeNull();
});
