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
      header.indexOf("header-actions"),
    );
  });

  test("uses the exact mockup icon geometry and all-projects mark", () => {
    const icons = read("src/components/icons/category-icon.tsx");
    const navigation = read(
      "src/features/catalog/components/category-navigation.tsx",
    );

    expect(icons).toContain('viewBox="0 0 487.6 487.6"');
    expect(icons).toContain('viewBox="0 0 512 512"');
    expect(icons).toContain('viewBox="-16 0 512 512"');
    expect(icons).toContain("M4 6h5m4 0h7M4 12h10m4 0h2M4 18h2m4 0h10");
    expect(icons).toContain("m7 3 5 3-5 3-5-3 5-3Z");
    expect(navigation).toContain('className="all-symbol"');
  });

  test("uses the mockup desktop category grid instead of an underline bar", () => {
    const css = read("src/styles/catalog.css");
    const globals = read("src/app/globals.css");

    expect(css).toMatch(
      /\.category-navigation\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(9,\s*minmax\(0,\s*1fr\)\)/s,
    );
    expect(css).not.toContain(".category-navigation button::after");
    expect(css).toMatch(
      /\.category-navigation button\.active\s*\{[^}]*border-color:[^}]*background:/s,
    );
    expect(css).toMatch(
      /\.category-navigation button\s*\{[^}]*font-size:\s*10px[^}]*line-height:\s*1\.15/s,
    );
    expect(globals).toMatch(/body\s*\{[^}]*font-size:\s*14px/s);
  });

  test("uses the mockup desktop workspace and toolbar geometry", () => {
    const css = read("src/styles/catalog.css");

    expect(css).toMatch(
      /\.catalog-layout\s*\{[^}]*grid-template-columns:\s*238px minmax\(0,\s*1fr\)[^}]*padding:\s*0/s,
    );
    expect(css).toMatch(
      /\.filter-panel\s*\{[^}]*padding:\s*20px 18px 50px[^}]*border-right:/s,
    );
    expect(css).toMatch(/\.catalog-main\s*\{[^}]*padding:\s*20px 22px 60px/s);
    expect(css).toMatch(
      /\.view-tabs\s*\{[^}]*border-radius:\s*7px[^}]*padding:\s*3px/s,
    );
    expect(css).toMatch(/\.sort-projects\s*\{[^}]*height:\s*36px/s);
  });

  test("uses reference card anatomy and sans typography", () => {
    const css = read("src/styles/catalog.css");

    expect(css).not.toContain('font-family: Georgia, "Times New Roman", serif');
    expect(css).not.toContain(".project-card::before");
    expect(css).toMatch(/\.card-bottom\s*\{[^}]*border-top:/s);
    expect(css).toMatch(/\.license\s*\{[^}]*border:\s*0/s);
    expect(css).toMatch(
      /\.project-grid\s*\{[^}]*repeat\(auto-fill,\s*minmax\(255px,\s*1fr\)\)[^}]*gap:\s*12px/s,
    );
    expect(css).toMatch(/\.card-top\s*\{[^}]*min-height:\s*48px/s);
    expect(css).toMatch(
      /\.function-symbol\s*\{[^}]*width:\s*23px[^}]*height:\s*23px[^}]*border:\s*0[^}]*border-radius:\s*0[^}]*background:\s*transparent/s,
    );
    expect(css).toMatch(
      /\.function-symbol svg\s*\{[^}]*width:\s*23px[^}]*height:\s*23px/s,
    );
  });

  test("keeps repository facts visible on mobile", () => {
    const responsive = read("src/styles/responsive.css");

    expect(responsive).not.toMatch(
      /\.community,\s*\n\s*\.repository-size\s*\{\s*display:\s*none/,
    );
  });

  test("uses the reference tablet and mobile breakpoints", () => {
    const responsive = read("src/styles/responsive.css");

    expect(responsive).toMatch(
      /@media \(min-width:\s*761px\) and \(max-width:\s*1050px\)[\s\S]*?\.catalog-layout\s*\{[^}]*grid-template-columns:\s*210px minmax\(0,\s*1fr\)/,
    );
    expect(responsive).toMatch(
      /@media \(min-width:\s*761px\) and \(max-width:\s*1050px\)[\s\S]*?\.project-grid\s*\{[^}]*repeat\(auto-fill,\s*minmax\(240px,\s*1fr\)\)/,
    );
    expect(responsive).toMatch(
      /@media \(max-width:\s*760px\)[\s\S]*?\.catalog-main\s*\{[^}]*padding:\s*16px 13px 50px/,
    );
    expect(responsive).toMatch(
      /\.catalog-controls\s*\{[^}]*grid-template-columns:\s*34px minmax\(0,\s*1fr\) 120px/s,
    );
  });

  test("restores reference filter vocabulary and controls", () => {
    const filters = read("src/features/catalog/components/filter-panel.tsx");
    const css = read("src/styles/catalog.css");

    expect(filters).toContain("Compatible frontend");
    expect(filters).toContain("Project kind");
    expect(filters).toContain("Capabilities & characteristics");
    expect(filters).toContain("Clear all");
    expect(filters).toContain("Search compatible frontends");
    expect(filters).toContain("Search capabilities and characteristics");
    expect(filters).toContain('className="metadata-options"');
    expect(filters).toContain("metadata-filter-chip");
    expect(filters).toContain("metadata-check");
    expect(css).toMatch(
      /\.metadata-filter-chip\s*\{[^}]*min-height:\s*25px[^}]*border-radius:\s*999px/s,
    );
    expect(css).toMatch(/\.metadata-search\s*\{[^}]*height:\s*36px/s);
  });
});
