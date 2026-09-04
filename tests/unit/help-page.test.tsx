import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import HelpPage from "@/app/menu/page";
import SecurityHelpPage from "@/app/menu/security/page";

afterEach(() => {
  cleanup();
});

test("presents the whole-site Menu with management first", () => {
  render(<HelpPage />);

  expect(screen.getByRole("heading", { name: /^Menu$/u })).toBeInTheDocument();
  expect(
    screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent),
  ).toEqual(["Manage and publish", "Browse and learn", "Reports and help"]);

  const taskLinks = screen
    .getAllByRole("link")
    .filter((link) => link.classList.contains("menu-item"));
  expect(taskLinks[0]).toHaveTextContent(
    "Update or rename your project listing",
  );
  const expectedLinks = [
    ["Update or rename your project listing", "/menu/manage-project"],
    ["Submit a project", "/submit/project"],
    ["Build or manage Kits", "/?mode=kits"],
    ["Withdraw a published Kit", "/menu/withdraw-kit"],
    ["Browse projects", "/"],
    ["Browse Kits", "/?mode=kits"],
    ["About Tavernary", "/about"],
    ["Catalog Policy", "/catalog-policy"],
    ["Report a project listing", "/menu/report-project"],
    ["Report a Kit", "/menu/report-kit"],
    ["Report a website problem", "/menu/report-website"],
    ["Ask a Tavernary question", "/menu/other"],
    ["Report a security issue privately", "/menu/security"],
  ] as const;
  expect(taskLinks).toHaveLength(expectedLinks.length);
  for (const [name, href] of expectedLinks) {
    const link = taskLinks.find(
      (candidate) =>
        candidate.querySelector(".menu-item-title")?.textContent === name,
    );
    expect(link).toHaveAttribute("href", href);
  }
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
