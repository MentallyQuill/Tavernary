import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

test("documents project submission automation and recovery controls", async () => {
  const [readme, contributorGuide, runbook, lifecycle, issueForm] =
    await Promise.all([
      readFile("README.md", "utf8"),
      readFile("docs/contributing/submission-and-review.md", "utf8"),
      readFile("docs/maintenance/operations-runbook.md", "utf8"),
      readFile("docs/architecture/catalog-lifecycle.md", "utf8"),
      readFile(".github/ISSUE_TEMPLATE/01-project-submission.yml", "utf8"),
    ]);

  for (const phrase of [
    "generate-project-submission.yml",
    "submission-pr-open",
    "submission-declined",
    "force_regeneration",
    "automation/project-submission-<issue-number>",
  ]) {
    expect(runbook).toContain(phrase);
  }

  expect(runbook).toContain(
    "Allow GitHub Actions to create and\napprove pull requests",
  );
  expect(runbook).toContain("Automation creates but never approves its own PR");
  expect(contributorGuide).toContain(
    "The generated PR is the sole human review",
  );
  expect(contributorGuide).toContain(
    "builder's frontend choices come from the current catalog",
  );
  expect(contributorGuide).toContain(
    "Contributors should edit the issue only until its generated PR exists",
  );
  expect(lifecycle).toContain(
    "Closing the generated PR without\n   merge declines the submission",
  );
  expect(lifecycle).toContain("External System Presets");
  expect(readme).toContain("static submission builder");
  expect(readme).toContain("No account, database service, or\nruntime API");
  for (const document of [readme, contributorGuide, issueForm]) {
    expect(document).toContain(
      "Frontends and Extensions require a public GitHub or Codeberg repository.",
    );
  }
  expect(runbook).toContain("providers.codeberg");
  expect(lifecycle).toContain("data/snapshots/codeberg/*.json");
});
