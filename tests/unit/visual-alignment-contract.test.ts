import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("catalog visual alignment", () => {
  test("uses the supplied deployable logo in mockup order", () => {
    const header = read("src/features/catalog/components/site-header.tsx");

    expect(header).toContain('src="./tavernary-logo.png"');
    expect(header.indexOf("brand-copy")).toBeLessThan(
      header.indexOf("brand-logo"),
    );
    expect(header.indexOf("brand-logo")).toBeLessThan(
      header.indexOf("header-primary-actions"),
    );
  });

  test("uses reference card anatomy and sans typography", () => {
    const css = read("src/styles/catalog.css");

    expect(css).not.toContain('font-family: Georgia, "Times New Roman", serif');
    expect(css).not.toContain(".project-card::before");
    expect(css).toMatch(/\.card-bottom\s*\{[^}]*border-top:/s);
    expect(css).toMatch(/\.license\s*\{[^}]*border:\s*0/s);
  });

  test("keeps repository facts visible on mobile", () => {
    const responsive = read("src/styles/responsive.css");

    expect(responsive).not.toMatch(
      /\.community,\s*\n\s*\.repository-size\s*\{\s*display:\s*none/,
    );
  });

  test("restores reference filter vocabulary and controls", () => {
    const filters = read("src/features/catalog/components/filter-panel.tsx");

    expect(filters).toContain("Compatible frontend");
    expect(filters).toContain("Project kind");
    expect(filters).toContain("Capabilities & characteristics");
    expect(filters).toContain("Clear all");
    expect(filters).toContain("Search compatible frontends");
    expect(filters).toContain("Search capabilities and characteristics");
  });
});
