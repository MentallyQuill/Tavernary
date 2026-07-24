import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

test("keeps text files stable across Windows and Linux checkouts", async () => {
  const attributes = await readFile(".gitattributes", "utf8");
  expect(attributes).toContain("* text=auto eol=lf");
});
