import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import AboutPage from "@/app/about/page";

afterEach(() => {
  cleanup();
});

test("explains safety, reporting, and legal information on About", () => {
  render(<AboutPage />);

  expect(
    screen.getByText(
      "Tavernary is a search and discovery catalog for AI roleplay tools in and around the SillyTavern community. It indexes public project information and directs visitors to each project's creator-owned repository or source page.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Safety and security" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Reporting and removal" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Legal information" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Sustainability and support" }),
  ).toBeNull();
  expect(screen.queryByText(/\$12 per month|donations/i)).toBeNull();
  expect(
    screen.queryByRole("link", { name: /costs and usage|ko-fi|donat/i }),
  ).toBeNull();
  expect(screen.getByRole("link", { name: "TavernKeeper" })).toHaveAttribute(
    "href",
    "https://mentallyquill.github.io/TavernKeeper/",
  );
  expect(
    screen.getByText(
      /scan results do not guarantee that a project is safe or free of harmful behavior/i,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/red means immediate danger at the exact scanned commit/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      /red projects remain listed so the community can see the warning/i,
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Get help" })).toHaveAttribute(
    "href",
    "/help",
  );
  expect(
    screen.getByRole("link", { name: "private security path" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/MentallyQuill/Tavernary/security/advisories/new",
  );
  expect(
    screen.getByText(/a verified personal GitHub owner/i),
  ).toBeInTheDocument();
  expect(screen.getByText(/Tavernary's owner.*any card/i)).toBeInTheDocument();
  expect(
    screen.getByText(
      /other organization maintainers and rights holders.*public report/i,
    ),
  ).toBeInTheDocument();
});
