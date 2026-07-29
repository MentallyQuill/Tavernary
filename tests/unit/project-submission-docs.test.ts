import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

test("documents project submission automation and recovery controls", async () => {
  const [
    readme,
    contributorGuide,
    runbook,
    lifecycle,
    issueForm,
    schemaReference,
    enrichmentReference,
  ] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("docs/contributing/submission-and-review.md", "utf8"),
    readFile("docs/maintenance/operations-runbook.md", "utf8"),
    readFile("docs/architecture/catalog-lifecycle.md", "utf8"),
    readFile(".github/ISSUE_TEMPLATE/01-project-submission.yml", "utf8"),
    readFile("docs/reference/project-record-schema.md", "utf8"),
    readFile("docs/reference/catalog-enrichment-report.md", "utf8"),
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
  expect(runbook).toContain("PROJECT_AUTO_PUBLICATION_ENABLED");
  expect(runbook).toContain("publish-project-transaction.yml");
  expect(runbook).toContain("exact validated head SHA");
  expect(runbook).toContain("post-publication");
  expect(runbook).not.toContain(
    "Automation creates but never approves its own PR",
  );
  expect(contributorGuide).toContain(
    "automatically publishes valid create, edit, source-move, and delist transactions",
  );
  expect(contributorGuide).toContain("PR remains the CI and audit transaction");
  expect(contributorGuide).toContain("consensual adult content");
  expect(contributorGuide).toContain("ordinary profanity");
  expect(contributorGuide).toContain("advisory and post-publication");
  expect(contributorGuide).toContain("owner-facing permanent");
  expect(contributorGuide).toContain("manual Tavernary staff maintenance");
  expect(contributorGuide).toContain(
    "builder's frontend choices come from the current catalog",
  );
  expect(contributorGuide).toContain("The source issue remains authoritative");
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
  expect(contributorGuide).toContain(
    "submitted Extension primary function is authoritative",
  );
  expect(lifecycle).toContain(
    "Frontends always use `frontend`; System Presets always use `preset`",
  );
  expect(lifecycle).toContain("never changes the canonical `primary_function`");
  expect(enrichmentReference).toContain(
    "summary, `metadata_status`, and `capabilities`",
  );
  expect(enrichmentReference).toContain("intake-only classification review");
  expect(schemaReference).not.toContain("`uncategorized`");
});
