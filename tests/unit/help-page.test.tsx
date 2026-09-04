import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import HelpPage from "@/app/menu/page";
import SecurityHelpPage from "@/app/help/security/page";

afterEach(() => {
  cleanup();
});

test("presents the whole-site Menu with management first", () => {
  render(<HelpPage />);

  expect(
    screen.getByRole("heading", { name: "Menu", exact: true }),
  ).toBeInTheDocument();
  expect(
    screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent),
  ).toEqual(["Manage and publish", "Browse and learn", "Reports and help"]);

  const taskLinks = screen.getAllByRole("link").filter((link) =>
    link.classList.contains("menu-item"),
  );
  expect(taskLinks[0]).toHaveTextContent("Update or rename your project listing");
  expect(taskLinks[0]).toHaveAttribute("href", "/menu/manage-project");
  expect(
    screen.getByRole("link", { name: /Report a security issue privately/ }),
  ).toHaveAttribute("href", "/menu/security");
  expect(screen.queryByRole("link", { name: /Support Tavernary/i })).toBeNull();
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
