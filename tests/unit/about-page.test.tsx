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
    "https://github.com/MentallyQuill/Tavernary/issues/new/choose",
  );
  expect(
    screen.getByRole("link", { name: "private security path" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/owner, maintainer, or rights holder/i),
  ).toBeInTheDocument();
});
