import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

test("documents reviewed Tavernary Pick and narrow safety repair procedures", async () => {
  const source = await readFile("docs/maintenance/kits.md", "utf8");
  expect(source).toContain("## Tavernary Pick");
  expect(source).toMatch(/edit only `tavernary_pick`/i);
  expect(source).toMatch(/do not change `updated_at`/i);
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
  const paths = [
    "docs/superpowers/specs/2026-07-24-kits-design.md",
    "docs/superpowers/specs/2026-07-24-kits-mobile-design.md",
    "docs/superpowers/specs/2026-07-24-kits-motion-interaction-design.md",
    "docs/maintenance/kits.md",
  ];
  const productSources = (
    await Promise.all(paths.map((path) => readFile(path, "utf8")))
  ).join("\n");

  expect(productSources).not.toMatch(/Kit Workspace/i);
  expect(productSources).toContain("Kit Builder");
  expect(productSources.toLowerCase()).toContain("long press");
  expect(productSources).toContain("Add to Kit");
  expect(productSources).toContain("dual-thumb");
  expect(productSources).toMatch(/does not open the Kit Builder/i);
  expect(productSources).toMatch(/no undo/i);
});
