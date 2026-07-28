import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import AboutPage from "@/app/about/page";

const documentationPaths = [
  "README.md",
  "SECURITY.md",
  "docs/contributing/contribution-overview.md",
  "docs/contributing/submission-and-review.md",
  "docs/contributing/kits.md",
  "docs/maintenance/operations-runbook.md",
  "docs/guides/using-the-catalog.md",
];

afterEach(() => {
  cleanup();
});

test("publishes the guided Help routes and owner workflow vocabulary", () => {
  const documentationCorpus = documentationPaths
    .map((path) => readFileSync(resolve(process.cwd(), path), "utf8"))
    .join("\n");

  for (const phrase of [
    "/help/",
    "Manage your project listing",
    "Report a project listing",
    "Report a website problem",
    "Report a Kit",
    "Get other help",
    "security/advisories/new",
    "project-owner-request",
    "automation/project-owner-request-<issue-number>",
  ]) {
    expect(documentationCorpus).toContain(phrase);
  }
});

test("limits automated owner management to verified personal owners", () => {
  render(AboutPage());

  expect(
    screen.getByText(/verified personal GitHub owner/i),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Reporting and removal" })
      .parentElement,
  ).toHaveTextContent(
    /Organization listings.*rights holders.*human-reviewed public report/i,
  );
});
