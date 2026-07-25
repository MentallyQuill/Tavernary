import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

test("ships canonical software, database, and Kit-content licenses", async () => {
  expect(await readFile("LICENSE", "utf8")).toContain(
    "GNU AFFERO GENERAL PUBLIC LICENSE",
  );
  expect(await readFile("LICENSES/ODbL-1.0.txt", "utf8")).toContain(
    "Open Database License",
  );
  expect(await readFile("LICENSES/DbCL-1.0.txt", "utf8")).toContain(
    "Database Contents License",
  );
  expect(await readFile("LICENSING.md", "utf8")).toContain(
    "Kit titles and descriptions: DbCL-1.0",
  );
});

test("keeps Tavernary brand assets outside the software and data grants", async () => {
  const licensing = await readFile("LICENSING.md", "utf8");
  const trademarks = await readFile("TRADEMARKS.md", "utf8");
  expect(licensing).toContain("Application and software: AGPL-3.0-only");
  expect(licensing).toContain("Catalog database: ODbL-1.0");
  expect(trademarks).toContain("Tavernary name");
  expect(trademarks).toContain("No trademark or brand license is granted");
});
