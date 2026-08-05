import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import AboutPage from "@/app/about/page";

afterEach(() => {
  cleanup();
});

test("explains safety, reporting, and legal information on About", () => {
  render(<AboutPage />);

  expect(
    screen.getByRole("heading", { name: "Safety and security" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Reporting and removal" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Legal information" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "TavernKeeper" })).toHaveAttribute(
    "href",
    "https://mentallyquill.github.io/TavernKeeper/",
  );
  expect(
    screen.getByText(
      /scan results are not a guarantee that a project is safe or free of harmful behavior/i,
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
  expect(
    screen.getByText(
      /reviewed Tavernary owners, admins, and maintainers.*any card/i,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      /other organization maintainers and rights holders.*public report/i,
    ),
  ).toBeInTheDocument();
});
