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
      /organization listings, maintainers who are not that verified owner, and rights holders/i,
    ),
  ).toBeInTheDocument();
});
