import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("lets the desktop safety disclosure use the available catalog width", () => {
  const css = readFileSync("src/styles/catalog.css", "utf8");
  const rule = css.match(
    /\.catalog-heading \.catalog-safety-disclosure\s*\{([^}]*)\}/,
  );

  expect(rule?.[1]).toBeDefined();
  expect(rule?.[1]).not.toMatch(/max-width\s*:/);
});
