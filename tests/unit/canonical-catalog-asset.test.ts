import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadCatalog } from "../../src/lib/catalog/load-catalog";

describe("canonical catalog asset", () => {
  it("loads the exact public catalog bytes used by Pages", async () => {
    const publicBytes = await readFile(
      resolve(process.cwd(), "public/catalog/tavernary-catalog-v8.json"),
      "utf8",
    );

    expect(JSON.parse(publicBytes)).toEqual(loadCatalog());
    expect(JSON.parse(publicBytes).schemaVersion).toBe(8);
  });

  it("keeps browser fixtures bound to the canonical public asset", async () => {
    const fixtureSources = await Promise.all(
      [
        "tests/helpers/generated-catalog.ts",
        "tests/e2e/static-export.spec.ts",
        "tests/e2e/kits-empty.spec.ts",
      ].map((path) => readFile(resolve(process.cwd(), path), "utf8")),
    );

    expect(fixtureSources.join("\n")).not.toContain(
      "src/generated/catalog.json",
    );
    expect(fixtureSources[0]).toContain(
      "public/catalog/tavernary-catalog-v8.json",
    );
  });
});
