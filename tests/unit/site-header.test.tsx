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

test("groups Companion and contrast controls separately from catalog search", () => {
  render(
    <SiteHeader
      search=""
      onSearch={() => undefined}
      searchRef={createRef<HTMLInputElement>()}
    />,
  );

  const search = screen.getByRole("search");
  const toggle = screen.getByRole("switch", { name: "Enhanced contrast" });
  const utilities = screen.getByRole("group", { name: "Site utilities" });
  expect(utilities).toContainElement(toggle);
  expect(utilities).toContainElement(
    screen.getByRole("link", { name: "Tavernary Companion" }),
  );
  expect(utilities).not.toContainElement(search);
});

test("introduces the Companion extension with a descriptive external link", () => {
  render(
    <SiteHeader
      search=""
      onSearch={() => undefined}
      searchRef={createRef<HTMLInputElement>()}
    />,
  );

  const companion = screen.getByRole("link", { name: "Tavernary Companion" });
  expect(companion).toHaveAttribute(
    "href",
    "https://github.com/MentallyQuill/TavernaryCompanion",
  );
  expect(companion).toHaveAttribute("target", "_blank");
  expect(companion).toHaveAttribute("rel", "noopener noreferrer");
  expect(companion).toHaveAccessibleDescription(
    "Extension for SillyTavern and ST-compatible frontends.",
  );
  expect(
    screen.getByText("Extension for SillyTavern and ST-compatible frontends."),
  ).toBeVisible();
});
