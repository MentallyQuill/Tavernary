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

test("documents both personal-owner and reviewed Tavernary staff management", () => {
  render(AboutPage());

  expect(
    screen.getByText(/verified personal GitHub owner/i),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Reporting and removal" })
      .parentElement,
  ).toHaveTextContent(/Tavernary owners, admins, and maintainers.*any card/i);
});

test("documents immutable trusted-editor authority instead of association alone", () => {
  const documentationCorpus = documentationPaths
    .map((path) => readFileSync(resolve(process.cwd(), path), "utf8"))
    .join("\n");
  const actionGuide = readFileSync(
    resolve(process.cwd(), "docs/maintenance/github-actions-user-guides.md"),
    "utf8",
  );

  expect(`${documentationCorpus}\n${actionGuide}`).toContain(
    "data/maintenance/trusted-tavernary-editors.json",
  );
  expect(`${documentationCorpus}\n${actionGuide}`).toMatch(
    /immutable GitHub (?:user )?ID/i,
  );
  expect(`${documentationCorpus}\n${actionGuide}`).toMatch(
    /association alone.*does not/i,
  );
});

test("documents the runtime owner failure codes without invented aliases", () => {
  const operationsRunbook = readFileSync(
    resolve(process.cwd(), "docs/maintenance/operations-runbook.md"),
    "utf8",
  );

  expect(operationsRunbook).toContain("unsupported-source");
  expect(operationsRunbook).toContain("owner-request-invalid");
  expect(operationsRunbook).not.toContain("owner-request-unsupported-source");
  expect(operationsRunbook).not.toContain("owner-request-invalid-operation");
});
