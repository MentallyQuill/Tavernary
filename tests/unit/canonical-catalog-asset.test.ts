import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadCatalog } from "../../src/lib/catalog/load-catalog";

describe("canonical catalog asset", () => {
  it("loads the exact public catalog bytes used by Pages", async () => {
    const publicBytes = await readFile(
      resolve(process.cwd(), "public/catalog/tavernary-catalog.json"),
      "utf8",
    );

    expect(JSON.parse(publicBytes)).toEqual(loadCatalog());
    expect(JSON.parse(publicBytes).schemaVersion).toBe(7);
  });
});
