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
