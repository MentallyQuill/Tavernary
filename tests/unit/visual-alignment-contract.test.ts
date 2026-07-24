import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("catalog visual alignment", () => {
  test("uses the supplied deployable logo in mockup order", () => {
    const header = read("src/features/catalog/components/site-header.tsx");

    expect(header).toContain('src="./tavernary-gems.png"');
    expect(header).not.toContain('src="./tavernary-logo.png"');
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
      /\.category-navigation\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(10,\s*minmax\(0,\s*1fr\)\)/s,
    );
    expect(css).not.toContain(".category-navigation button::after");
    expect(css).toMatch(
      /\.category-navigation button\.active\s*\{[^}]*border-color:[^}]*background:/s,
    );
    expect(css).toMatch(
      /\.category-navigation button\s*\{[^}]*justify-content:\s*center[^}]*font-size:\s*10px[^}]*line-height:\s*1\.15[^}]*text-align:\s*center/s,
    );
    expect(globals).toMatch(/body\s*\{[^}]*font-size:\s*14px/s);
  });

  test("uses the mockup desktop workspace and toolbar geometry", () => {
    const css = read("src/styles/catalog.css");
    const toolbar = read("src/features/catalog/components/catalog-toolbar.tsx");

    expect(css).toMatch(
      /\.catalog-layout\s*\{[^}]*grid-template-columns:\s*238px minmax\(0,\s*1fr\)[^}]*padding:\s*0/s,
    );
    expect(css).toMatch(
      /\.filter-panel\s*\{[^}]*padding:\s*20px 18px 50px[^}]*border-right:/s,
    );
    expect(css).toMatch(/\.catalog-main\s*\{[^}]*padding:\s*20px 22px 60px/s);
    expect(toolbar).not.toContain("view-tabs");
    expect(toolbar).not.toContain("onView");
    expect(toolbar).toContain("catalog-primary-controls");
    expect(css).toMatch(/\.sort-projects\s*\{[^}]*height:\s*36px/s);
  });

  test("uses reference card anatomy and sans typography", () => {
    const css = read("src/styles/catalog.css");
    const card = read("src/features/catalog/components/project-card.tsx");

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
    expect(card).not.toContain("two-week commit totals");
    expect(card).not.toContain("This icon shows");
    expect(css).toMatch(
      /\.compact-cards \.project-card\s*\{[^}]*height:\s*auto[^}]*min-height:\s*0[^}]*padding:\s*11px 12px/s,
    );
    expect(css).toMatch(
      /\.compact-cards \.community,[\s\S]*?\.compact-cards \.card-summary\s*\{[^}]*display:\s*none/s,
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
      /\.catalog-primary-controls\s*\{[^}]*min-width:\s*0/s,
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
    expect(filters).not.toContain("Search capabilities and characteristics");
    expect(filters).toContain("metadata-options");
    expect(filters).toContain("metadata-filter-chip");
    expect(filters).toContain("metadata-check");
    expect(filters).toContain("metadata-disclosure");
    expect(css).toMatch(
      /\.metadata-filter-chip\s*\{[^}]*min-height:\s*25px[^}]*border-radius:\s*999px/s,
    );
    expect(css).toMatch(
      /\.metadata-options\.collapsed\s*\{[^}]*max-height:\s*calc\(25px \* 4 \+ 6px \* 3\)[^}]*overflow:\s*hidden/s,
    );
  });

  test("adds the compact legal footer to the shared filter surface", () => {
    const filters = read("src/features/catalog/components/filter-panel.tsx");
    const css = read("src/styles/catalog.css");

    expect(filters).toContain('className="filter-legal"');
    expect(filters).toContain("Tavernary");
    expect(filters).toContain("AGPL-3.0-only");
    expect(filters).toContain(
      "https://github.com/MentallyQuill/Tavernary/blob/main/LICENSE",
    );
    expect(css).toMatch(
      /\.filter-legal\s*\{[^}]*color:\s*var\(--color-muted\)[^}]*white-space:\s*nowrap/s,
    );
  });

  test("uses the approved semantic colors", () => {
    const tokens = read("src/styles/tokens.css");
    const css = read("src/styles/catalog.css");

    expect(tokens).toContain("--color-muted: #849a9e");
    expect(css).toMatch(
      /\.category-navigation button\s*\{[^}]*color:\s*var\(--color-text-primary\)/s,
    );
    expect(css).toMatch(
      /button\[data-category="frontend"\][\s\S]*?color:\s*var\(--color-kind-frontend\)/s,
    );
    expect(css).toMatch(
      /\.card-identity\s*\{[^}]*color:\s*var\(--kind-color\)/s,
    );
    expect(css).toMatch(
      /\.activity-bars i\s*\{[^}]*background:\s*var\(--color-kind-preset\)/s,
    );
    expect(css).toMatch(
      /\.license-osi-approved\s*\{[^}]*color:\s*var\(--color-kind-preset\)/s,
    );
    expect(css).toMatch(
      /\.frontend-chip\s*\{[^}]*border-color:\s*var\(--color-kind-frontend\)[^}]*color:\s*var\(--color-kind-frontend\)/s,
    );
    expect(css).toMatch(
      /\.chip,[\s\S]*?\.license\s*\{[^}]*border:\s*1px solid var\(--color-border-strong\)[^}]*color:\s*var\(--color-text-secondary\)/s,
    );
    expect(css).toMatch(
      /\.brand-name\s*\{[^}]*color:\s*var\(--color-kind-extension\)/s,
    );
    expect(css).toMatch(
      /\.submit-link\s*\{[^}]*color:\s*var\(--color-page\)[^}]*background:\s*var\(--color-kind-extension\)/s,
    );
    expect(css).toMatch(
      /\.site-search input\s*\{[^}]*appearance:\s*none[^}]*outline:\s*0[^}]*box-shadow:\s*none/s,
    );
  });

  test("uses the approved gem geometry", () => {
    const css = read("src/styles/catalog.css");
    const responsive = read("src/styles/responsive.css");

    expect(css).toMatch(
      /\.brand-logo\s*\{[^}]*width:\s*52px[^}]*height:\s*47px[^}]*transform:\s*none/s,
    );
    expect(responsive).toMatch(
      /@media \(max-width:\s*760px\)[\s\S]*?\.brand-logo\s*\{[^}]*width:\s*48px[^}]*height:\s*43px[^}]*transform:\s*none/,
    );
  });
});
