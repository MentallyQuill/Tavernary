import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import HelpPage from "@/app/help/page";
import SecurityHelpPage from "@/app/help/security/page";

afterEach(() => {
  cleanup();
});

test("shows five ordinary Help paths in approved order", () => {
  render(<HelpPage />);

  const ordinaryPaths = screen
    .getAllByRole("link")
    .map((link) => link.textContent?.trim())
    .filter((name) =>
      [
        "Manage your project listing",
        "Report a project listing",
        "Report a website problem",
        "Report a Kit",
        "Get other help",
      ].includes(name ?? ""),
    );

  expect(ordinaryPaths).toEqual([
    "Manage your project listing",
    "Report a project listing",
    "Report a website problem",
    "Report a Kit",
    "Get other help",
  ]);
  expect(
    screen.getByRole("link", { name: "Open private security reporting" }),
  ).toHaveAttribute("href", "/help/security");
});

test("never exposes a public issue link from the security page", () => {
  render(<SecurityHelpPage />);

  expect(
    screen.getByRole("link", { name: "Open GitHub's private report form" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/MentallyQuill/Tavernary/security/advisories/new",
  );
  expect(document.body.innerHTML).not.toContain("/issues/new");
});
