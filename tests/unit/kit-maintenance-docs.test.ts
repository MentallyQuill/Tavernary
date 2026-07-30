import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

test("documents community-driven discovery and narrow safety repair procedures", async () => {
  const source = await readFile("docs/maintenance/kits.md", "utf8");
  expect(source).not.toMatch(/Tavernary Pick|tavernary_pick/i);
  expect(source).toMatch(/community support.*Trending/i);
  expect(source).toMatch(/no maintainer-curated\s+endorsement/i);
  expect(source).toContain("reviewed pull request");
  expect(source).toContain("## Safety repair");
  for (const field of [
    "`id`",
    "author numeric ID",
    "source issue",
    "`published_at`",
    "support snapshot",
  ]) {
    expect(source).toContain(field);
  }
  expect(source).toMatch(/advance `updated_at`/i);
  expect(source).toMatch(/complete catalog gates/i);
});

test("documents the current Kit Builder batch-selection behavior", async () => {
  const legacyPaths = [
    "docs/superpowers/specs/2026-07-24-kits-design.md",
    "docs/superpowers/specs/2026-07-24-kits-mobile-design.md",
    "docs/superpowers/specs/2026-07-24-kits-motion-interaction-design.md",
  ];
  const legacySpecs = await Promise.all(
    legacyPaths.map((path) => readFile(path, "utf8")),
  );
  const currentSpec = await readFile(
    "docs/superpowers/specs/2026-07-25-unified-kit-selection-design.md",
    "utf8",
  );
  const productSources = (
    await Promise.all(
      [...legacyPaths, "docs/maintenance/kits.md"].map((path) =>
        readFile(path, "utf8"),
      ),
    )
  ).join("\n");
  const motionSpec = await readFile(
    "docs/superpowers/specs/2026-07-24-kits-motion-interaction-design.md",
    "utf8",
  );

  expect(productSources).not.toMatch(/Kit Workspace/i);
  expect(productSources).toContain("Kit Builder");
  expect(productSources).toContain("Add to Kit");
  expect(productSources).toContain("dual-thumb");
  expect(productSources).toMatch(/does not open the Kit Builder/i);
  expect(productSources).toMatch(/no undo/i);
  expect(motionSpec).not.toMatch(/48-pixel rail/i);
  expect(motionSpec).toMatch(/72-pixel rail/i);
  expect(currentSpec).toContain("always visible");
  expect(currentSpec).toContain("Add to Kit");
  expect(currentSpec).toContain("desktop and mobile");
  expect(currentSpec).toMatch(/supersedes/i);
  for (const legacySpec of legacySpecs) {
    expect(legacySpec).toContain("Superseded interaction");
  }
});

test("documents automatic Kit publication and severe-language revalidation", async () => {
  const [form, contributorGuide, submissionFlow, maintenance, runbook] =
    await Promise.all([
      readFile(".github/ISSUE_TEMPLATE/05-kit-submission.yml", "utf8"),
      readFile("docs/contributing/kits.md", "utf8"),
      readFile("docs/contributing/submission-and-review.md", "utf8"),
      readFile("docs/maintenance/kits.md", "utf8"),
      readFile("docs/maintenance/operations-runbook.md", "utf8"),
    ]);
  const publicCopy = `${form}\n${contributorGuide}\n${submissionFlow}`;

  expect(publicCopy).toMatch(/publish(?:es|ed)? automatically/i);
  expect(publicCopy).toMatch(/title and (?:description|summary)/i);
  expect(publicCopy).toMatch(/severe language/i);
  expect(publicCopy).toMatch(/return to the retained Tavernary draft/i);
  expect(publicCopy).not.toMatch(/edit the issue/i);
  expect(publicCopy).not.toMatch(/Kit.*maintainer review/i);

  expect(maintenance).toContain("## Safety repair");
  expect(runbook).toContain("kit-publication-ready");
  expect(runbook).toContain("apply-kit-submission.yml");
  expect(runbook).toMatch(/closes the source issue/i);
  expect(runbook).toMatch(/exact.*SHA/i);
});

test("documents trusted Kit edits without replacing canonical provenance", async () => {
  const [maintenance, submissionFlow, actionGuide] = await Promise.all([
    readFile("docs/maintenance/kits.md", "utf8"),
    readFile("docs/contributing/submission-and-review.md", "utf8"),
    readFile("docs/maintenance/github-actions-user-guides.md", "utf8"),
  ]);
  const corpus = `${maintenance}\n${submissionFlow}\n${actionGuide}`;

  expect(corpus).toContain("tavernary-staff");
  expect(corpus).toContain("data/maintenance/trusted-tavernary-editors.json");
  expect(corpus).toMatch(/staff edit.*preserves.*author/i);
  expect(corpus).toMatch(/source issue.*published_at.*support snapshot/is);
  expect(corpus).toMatch(/valid issue dispatches.*automatically/is);
});
