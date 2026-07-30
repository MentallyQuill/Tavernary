import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("catalog visual alignment", () => {
  test("positions one animated Kit share notice above safe areas", () => {
    const css = read("src/styles/catalog.css");
    const responsive = read("src/styles/responsive.css");

    expect(css).toMatch(
      /\.kit-share-notice\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*120[^}]*bottom:\s*max\(22px,\s*env\(safe-area-inset-bottom\)\)/s,
    );
    expect(css).toContain("@keyframes kit-share-notice-enter");
    expect(css).toContain("@keyframes kit-share-notice-life");
    expect(css).toMatch(
      /\.kit-share-notice\[data-tone="copied"\]\s*\{[^}]*animation:\s*kit-share-notice-life\s+2000ms/s,
    );
    expect(css).toMatch(
      /\.catalog-shell:has\(\.project-selection-dock\) \.kit-share-notice\s*\{[^}]*bottom:\s*max\(92px,\s*calc\(env\(safe-area-inset-bottom\) \+ 92px\)\)/s,
    );
    expect(css).toMatch(
      /\.kit-share-notice\[data-tone="fallback"\]\s*\{[^}]*animation:\s*kit-share-notice-enter\s+150ms/s,
    );
    expect(responsive).toMatch(
      /\.kit-share-notice\s*\{[^}]*animation:\s*none[^}]*transform:\s*none/s,
    );
  });

  test("gives desktop Kit inspection one narrow body scroll", () => {
    const css = read("src/styles/catalog.css");
    const responsive = read("src/styles/responsive.css");

    expect(css).toContain(
      "--kit-builder-expanded-width: clamp(280px, 22vw, 340px)",
    );
    expect(css).toMatch(
      /\.kit-builder-panel\s*\{[^}]*--kit-builder-content-inset:\s*12px[^}]*padding:\s*18px var\(--kit-builder-content-inset\)/s,
    );
    expect(css).toMatch(
      /\.kit-builder-panel\[data-mode="inspect"\] \.kit-builder-panel-body\s*\{[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/s,
    );
    expect(css).toMatch(
      /\.kit-project-stack\s*\{[^}]*padding:\s*0[^}]*overflow:\s*visible/s,
    );
    expect(css).toMatch(
      /\.kit-builder-panel\[data-mode="inspect"\]\s*\.kit-builder-panel-body::-webkit-scrollbar\s*\{[^}]*width:\s*6px/s,
    );
    expect(css).toMatch(
      /\.kit-builder-scroll-fade\s*\{[^}]*pointer-events:\s*none/s,
    );
    expect(responsive).toMatch(
      /\.kit-builder-panel-header,\s*\.kit-builder-panel-body-frame\s*\{[^}]*width:\s*auto[^}]*min-width:\s*0/s,
    );
    expect(css).toMatch(
      /\.kit-card-description\s*\{[^}]*display:\s*-webkit-box[^}]*overflow:\s*hidden[^}]*-webkit-box-orient:\s*vertical[^}]*-webkit-line-clamp:\s*4/s,
    );
  });

  test("uses palette-safe semantic styling for unavailable Kit projects", () => {
    const css = read("src/styles/catalog.css");

    expect(css).toMatch(
      /\.kit-project-card-unavailable\s*\{[^}]*cursor:\s*not-allowed[^}]*border-color:\s*var\(--color-border-default\)[^}]*color:\s*var\(--color-text-muted\)[^}]*background:\s*var\(--color-bg-surface\)/s,
    );
    expect(css).toMatch(
      /\.kit-project-card-unavailable\s*\{[^}]*--kind-color:\s*var\(--color-text-muted\)/s,
    );
    expect(css).toMatch(
      /\.kit-project-card-unavailable h2\s*\{[^}]*color:\s*var\(--color-text-muted\)/s,
    );
    expect(css).not.toMatch(
      /\.kit-project-card-unavailable\s*\{[^}]*opacity:\s*(?!0(?:;|\s*\}))/s,
    );
  });

  test("aligns the inspector summary and administrative controls", () => {
    const css = read("src/styles/catalog.css");

    expect(css).toMatch(
      /\.kit-builder-inspect-heading h2\s*\{[^}]*font-size:\s*17px[^}]*font-weight:\s*720[^}]*letter-spacing:\s*-0\.02em[^}]*line-height:\s*1\.3/s,
    );
    expect(css).toMatch(
      /\.kit-builder-inspect-identity small\s*\{[^}]*font-size:\s*10px[^}]*font-weight:\s*500/s,
    );
    expect(css).toMatch(
      /\.kit-builder-inspect-description\s*\{[^}]*overflow:\s*hidden[^}]*-webkit-line-clamp:\s*4/s,
    );
    expect(css).toMatch(
      /@media \(min-width:\s*761px\)[\s\S]*?\.kit-builder-inspect-description\s*\{[^}]*font-size:\s*11px[^}]*line-height:\s*1\.48/s,
    );
    expect(css).toMatch(
      /\.kit-builder-panel-primary-actions,\s*\.kit-builder-panel-admin-actions\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s,
    );
    expect(css).toMatch(
      /\.kit-builder-panel-actions \.kit-preview-action\s*\{[^}]*width:\s*auto[^}]*min-height:\s*36px[^}]*font-size:\s*12px/s,
    );
    expect(css).toMatch(
      /\.kit-project-kind-summary\s*\{[^}]*color:\s*var\(--color-preset\)[^}]*font-size:\s*11px/s,
    );
    expect(css).toMatch(
      /\.kit-withdrawal-action\s*\{[^}]*border-color:\s*var\(--color-danger-border\)[^}]*color:\s*var\(--color-danger-text\)/s,
    );
  });

  test("locks Kit count and action motion", () => {
    const css = read("src/styles/catalog.css");
    const responsive = read("src/styles/responsive.css");

    expect(css).toMatch(
      /\.kit-project-count-tag\s*\{[^}]*border-radius:\s*999px[^}]*white-space:\s*nowrap/s,
    );
    expect(css).toMatch(
      /\.kit-card-action\s*\{[^}]*150ms[^}]*transform\s+150ms/s,
    );
    expect(css).toMatch(/\.kit-card-action:active\s*\{[^}]*scale\(0\.98\)/s);
    expect(responsive).toMatch(
      /\.kit-card-action:active[^}]*\{[^}]*transform:\s*none/s,
    );
  });

  test("uses Kit Builder module names", () => {
    expect(() =>
      read("src/features/kits/components/kit-builder-panel.tsx"),
    ).not.toThrow();
    expect(() => read("src/features/kits/use-kit-builder.ts")).not.toThrow();
  });

  test("uses the supplied Kit Builder icon geometry", () => {
    const icons = read("src/components/icons/category-icon.tsx");

    expect(icons).toContain('name === "kit-builder"');
    expect(icons).toContain('viewBox="0 0 1920 1920"');
    expect(icons).toContain("M1807.124.056V1920");
  });

  test("defines shared controls and a horizontal Kit Builder rail", () => {
    const css = read("src/styles/catalog.css");

    expect(css).toContain(".control-primary");
    expect(css).toContain(".control-secondary");
    expect(css).toContain(".control-quiet");
    expect(css).toContain(".control-icon");
    expect(css).toContain(".control-select");
    expect(css).toContain(".kit-builder-rail");
    expect(css).not.toContain("writing-mode: vertical-rl");
  });

  test("styles one selected dual-range track with touch-safe thumbs", () => {
    const css = read("src/styles/catalog.css");
    const responsive = read("src/styles/responsive.css");

    expect(css).toMatch(
      /\.dual-range-track::before\s*\{[^}]*left:\s*var\(--range-start\)[^}]*right:\s*calc\(100% - var\(--range-end\)\)[^}]*background:\s*var\(--color-progress-fill\)/s,
    );
    expect(css).toMatch(
      /\.dual-range input\[type="range"\]\s*\{[^}]*position:\s*absolute[^}]*background:\s*transparent/s,
    );
    expect(responsive).toMatch(
      /@media \(pointer:\s*coarse\)[\s\S]*?\.dual-range-track\s*\{[^}]*min-height:\s*44px/s,
    );
    expect(responsive).toMatch(
      /@media \(pointer:\s*coarse\)[\s\S]*?\.dual-range input\[type="range"\]::-webkit-slider-thumb\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s,
    );
    expect(responsive).toMatch(
      /@media \(pointer:\s*coarse\)[\s\S]*?\.dual-range input\[type="range"\]::-moz-range-thumb\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s,
    );
  });

  test("uses one persistent, responsive Kit control language on every card", () => {
    const css = read("src/styles/catalog.css");
    const responsive = read("src/styles/responsive.css");
    const motion = read("src/styles/motion.css");
    const tokens = read("src/styles/tokens.css");

    expect(tokens).toContain("--color-action-primary-text: #161008;");
    expect(css).toMatch(
      /\.control-primary\s*\{[^}]*color:\s*var\(--color-action-primary-text\)/s,
    );
    expect(css).toMatch(
      /\.header-actions \.submit-link\s*\{[^}]*color:\s*var\(--color-action-primary-text\)/s,
    );
    expect(css).toMatch(
      /\.project-card-shell\.selected \.project-card\s*\{[^}]*outline:\s*2px solid var\(--color-accent-teal\)/s,
    );
    expect(css).toMatch(
      /\.project-card-shell\.in-draft \.project-card\s*\{[^}]*border-color:\s*var\(--color-functional\)/s,
    );
    expect(css).toMatch(
      /\.project-card-shell\.has-kit-control \.card-utility\s*\{[^}]*padding-right:\s*40px/s,
    );
    expect(css).toMatch(
      /\.project-kit-control-hit\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*4px[^}]*right:\s*4px[^}]*width:\s*44px[^}]*height:\s*44px/s,
    );
    expect(css).toMatch(
      /\.project-kit-control-hit\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s,
    );
    expect(css).toMatch(
      /\.project-kit-control\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*background:\s*transparent/s,
    );
    expect(css).toMatch(
      /\.project-card-shell:hover,\s*\.project-card-shell:focus-within\s*\{[^}]*transform:\s*translateY\(-2px\)/s,
    );
    expect(css).toMatch(
      /\.project-card-shell:has\(\.project-card:active\),\s*\.project-card-shell:has\(\.project-kit-control:active\)\s*\{[^}]*transform:\s*scale\(0\.98\)/s,
    );
    expect(css).toMatch(
      /\.project-kit-control-face\s*\{[^}]*width:\s*28px[^}]*height:\s*28px[^}]*aspect-ratio:\s*1[^}]*color:\s*var\(--color-action-primary-text\)[^}]*background:\s*var\(--color-action-primary-bg\)[^}]*box-shadow:\s*none/s,
    );
    expect(css).toMatch(
      /\.project-kit-control\[aria-pressed="true"\] \.project-kit-control-face\s*\{[^}]*box-shadow:\s*inset/s,
    );
    expect(css).toMatch(
      /\.kit-builder-remove > span\s*\{[^}]*width:\s*28px[^}]*height:\s*28px[^}]*color:\s*var\(--color-action-primary-text\)[^}]*background:\s*var\(--color-action-primary-bg\)/s,
    );
    expect(css).toMatch(
      /\.kit-builder-remove\[aria-pressed="true"\] > span\s*\{[^}]*box-shadow:\s*inset/s,
    );
    expect(css).toMatch(
      /\.project-in-draft\s*\{[^}]*color:\s*var\(--color-functional-text\)/s,
    );
    expect(responsive).toMatch(
      /@media \(pointer:\s*coarse\)[\s\S]*?\.project-kit-control-hit\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s,
    );
    expect(responsive).toMatch(
      /@media \(pointer:\s*coarse\)[\s\S]*?\.project-kit-control\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s,
    );
    expect(responsive).toMatch(
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.project-card-shell:hover,[\s\S]*?\.project-card-shell:has\(\.project-kit-control:active\)\s*\{[^}]*transform:\s*none/s,
    );
    expect(motion).toMatch(
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.project-kit-control/s,
    );
    expect(css).not.toContain(".catalog-project-drag-handle");
    expect(css).not.toContain(".catalog-project-drag-ghost");
    expect(responsive).not.toContain(".catalog-layout.catalog-drag-active");
  });

  test("keeps the selection dock aligned, touch-safe, and clear of the final card", () => {
    const css = read("src/styles/catalog.css");
    const responsive = read("src/styles/responsive.css");
    const motion = read("src/styles/motion.css");

    expect(css).toMatch(
      /\.project-selection-dock\s*\{[^}]*position:\s*fixed[^}]*left:\s*calc\(238px \+ 22px\)[^}]*right:\s*calc\(clamp\(280px,\s*22vw,\s*340px\) \+ 22px\)/s,
    );
    expect(css).toMatch(/\.project-selection-spacer\s*\{[^}]*height:\s*112px/s);
    expect(css).toMatch(
      /\.project-selection-dock\s*\{[^}]*transition:\s*opacity 160ms[^}]*transform 160ms/s,
    );
    expect(responsive).toMatch(
      /@media \(max-width:\s*760px\)[\s\S]*?\.project-selection-dock\s*\{[^}]*left:\s*max\(13px,\s*env\(safe-area-inset-left\)\)[^}]*min-height:\s*44px/s,
    );
    expect(motion).toMatch(
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.project-selection-dock/s,
    );
  });

  test("uses the supplied trihex lockup with live tagline", () => {
    const header = read("src/features/catalog/components/site-header.tsx");

    expect(header).toContain('src="./tavernary-trihex.png"');
    expect(header).toContain("Where AI roleplay tools gather");
    expect(header.indexOf("brand-logo")).toBeLessThan(
      header.indexOf("brand-copy"),
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

  test("gives Kits and All Projects equally prominent white navigation marks", () => {
    const icons = read("src/components/icons/category-icon.tsx");
    const css = read("src/styles/catalog.css");
    const tokens = read("src/styles/tokens.css");

    expect(icons).toContain('data-icon="kit"');
    expect(icons).toContain('viewBox="3 3 26 26"');
    expect(icons).toContain(
      "M29,5a2,2,0,0,0-2-2H5A2,2,0,0,0,3,5V27a2,2,0,0,0,2,2H27a2,2,0,0,0,2-2ZM27,5V9H5V5Zm0,22H5V23H27Zm0-6H5V17H27Zm0-6H5V11H27Z",
    );
    expect(tokens).toContain("--color-accent-teal: #2DD4BF;");
    expect(css).toMatch(
      /\.category-navigation button:is\(\[data-category="kits"\], \[data-category="all"\]\)\s*\{[^}]*color:\s*var\(--color-text-primary\)/s,
    );
    expect(css).toMatch(
      /\.category-navigation button\[data-category="kits"\] svg,\s*\.category-navigation button\[data-category="all"\] \.all-symbol\s*\{[^}]*color:\s*var\(--color-text-primary\)/s,
    );
    expect(css).toContain(
      'button:not([data-category="all"]):not([data-category="kits"]):not(',
    );
    expect(css).toMatch(
      /\.category-navigation button\[data-category="kits"\] svg,\s*\.category-navigation \.all-symbol\s*\{[^}]*width:\s*18px[^}]*height:\s*18px/s,
    );
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
      /\.catalog-layout:has\(> \.kit-draft-pill-container\)\s*\{[^}]*grid-template-columns:\s*238px minmax\(0,\s*1fr\)/s,
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
    expect(css).toMatch(
      /\.card-bottom\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*align-items:\s*stretch[^}]*border-top:/s,
    );
    expect(css).toMatch(
      /\.card-chips\s*\{[^}]*min-height:\s*40px[^}]*max-height:\s*40px[^}]*flex-wrap:\s*wrap[^}]*overflow:\s*hidden/s,
    );
    expect(css).toMatch(
      /\.card-utility\s*\{[^}]*display:\s*flex[^}]*min-height:\s*28px[^}]*align-items:\s*center/s,
    );
    expect(css).toMatch(/\.license\s*\{[^}]*border:\s*0/s);
    expect(css).toMatch(
      /\.project-grid\s*\{[^}]*repeat\(auto-fill,\s*minmax\(320px,\s*1fr\)\)[^}]*gap:\s*12px/s,
    );
    expect(css).toMatch(
      /\.card-top\s*\{[^}]*min-height:\s*48px[^}]*flex-wrap:\s*wrap/s,
    );
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
      /\.compact-cards \.project-grid\s*\{[^}]*minmax\(255px,\s*1fr\)/s,
    );
    expect(css).toMatch(
      /\.compact-cards \.community,[\s\S]*?\.compact-cards \.card-state-list,[\s\S]*?\.compact-cards \.card-bottom\s*\{[^}]*display:\s*none/s,
    );
    expect(css).toMatch(
      /\.compact-cards \.card-summary\s*\{[^}]*display:\s*block[^}]*min-height:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s,
    );
    expect(css).toMatch(
      /\.compact-cards \.card-title\s*\{[^}]*display:\s*block[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s,
    );
  });

  test("keeps the Kit control on the right inside the card shell motion frame", () => {
    const css = read("src/styles/catalog.css");

    expect(css).toMatch(
      /\.project-card-shell\s*\{[^}]*transition:[^}]*transform/s,
    );
    expect(css).toMatch(
      /\.project-card-shell:hover,\s*\.project-card-shell:focus-within\s*\{[^}]*transform:\s*translateY\(-2px\)/s,
    );
    expect(css).toMatch(/\.project-kit-control-hit\s*\{[^}]*right:\s*4px/s);
    expect(css).not.toMatch(/\.project-kit-control-hit\s*\{[^}]*left:\s*4px/s);
    expect(css).toMatch(
      /\.project-card-shell\.has-kit-control \.card-utility\s*\{[^}]*padding-right:\s*40px/s,
    );
    expect(css).toMatch(
      /\.compact-cards \.project-card h2,[\s\S]*?\.compact-cards \.card-summary\s*\{[^}]*padding-right:\s*44px/s,
    );
  });

  test("keeps a bounded two-card relationship pair readable without overlapping Kit controls", () => {
    const css = read("src/styles/catalog.css");

    expect(css).toMatch(
      /\.relationship-pair\s*\{[^}]*width:\s*100%[^}]*max-width:\s*900px[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*760px\)[\s\S]*?\.relationship-pair\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
    expect(css).toMatch(
      /\.project-relationship-control\s*\{[^}]*display:\s*flex/s,
    );
    expect(css).toMatch(
      /\.project-relationship-control\s*\{[^}]*bottom:\s*10px[^}]*left:\s*18px[^}]*right:\s*48px[^}]*gap:\s*6px/s,
    );
    expect(css).not.toMatch(
      /\.project-card-shell\.has-relationship-control \.project-card\s*\{[^}]*padding-bottom:/s,
    );
    expect(css).toMatch(
      /\.project-relationship-control button\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/s,
    );
    expect(css).toMatch(
      /\.compact-cards \.project-relationship-control\s*\{[^}]*display:\s*none/s,
    );
    expect(css).toMatch(
      /\.compact-cards \.relationship-pair\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*760px\)[\s\S]*?\.compact-cards \.relationship-pair\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
  });

  test("distinguishes builder sections and uses one desktop toggle size", () => {
    const css = read("src/styles/catalog.css");

    expect(css).toMatch(
      /\.kit-frontend-slot\s*\{[^}]*border-color:\s*var\(--color-frontend-border\)/s,
    );
    expect(css).toMatch(
      /\.kit-composition-section h3\s*\{[^}]*text-transform:\s*uppercase/s,
    );
    expect(css).toMatch(
      /\.kit-builder-toggle\s*\{[^}]*width:\s*36px[^}]*height:\s*36px/s,
    );
    expect(css).toMatch(
      /\.kit-builder-panel\s*\{[^}]*height:\s*var\(--kit-builder-visible-height,\s*calc\(100dvh - 116px\)\)/s,
    );
  });

  test("styles the empty Frontend slot as a tokenized catalog shortcut", () => {
    const css = read("src/styles/catalog.css");

    expect(css).toMatch(
      /\.kit-frontend-discovery\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*cursor:\s*pointer/s,
    );
    expect(css).toMatch(
      /\.kit-frontend-discovery strong\s*\{[^}]*color:\s*var\(--color-frontend-text\)/s,
    );
    expect(css).toMatch(
      /\.kit-frontend-discovery:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus-ring\)/s,
    );
    expect(css).toMatch(
      /\.kit-frontend-discovery:hover\s*\{[^}]*background:\s*var\(--color-frontend-bg-hover\)/s,
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
    const tablet = responsive.slice(
      responsive.indexOf("@media (min-width: 761px)"),
      responsive.indexOf("@media (max-width: 760px)"),
    );

    expect(tablet).toMatch(
      /\.catalog-layout\s*\{[^}]*grid-template-columns:\s*210px minmax\(0,\s*1fr\) clamp\(280px,\s*32vw,\s*340px\)/,
    );
    expect(tablet).toMatch(
      /\.catalog-layout:has\(> \.kit-draft-pill-container\)\s*\{[^}]*grid-template-columns:\s*210px minmax\(0,\s*1fr\)/,
    );
    expect(tablet).not.toMatch(/\.kit-workspace\s*\{[^}]*position:\s*fixed/);
    expect(responsive).toMatch(
      /@media \(max-width:\s*760px\)[\s\S]*?\.catalog-main\s*\{[^}]*padding:\s*16px 13px 50px/,
    );
    expect(responsive).toMatch(
      /\.catalog-primary-controls\s*\{[^}]*min-width:\s*0/s,
    );
  });

  test("restores reference filter vocabulary and controls", () => {
    const filters = read("src/features/catalog/components/filter-panel.tsx");
    const controls = read(
      "src/features/catalog/components/filter-controls.tsx",
    );
    const css = read("src/styles/catalog.css");

    expect(filters).toContain("Compatible frontend");
    expect(filters).toContain("Project kind");
    expect(filters).toContain("Goals &amp; traits");
    expect(filters).toContain("Search goals and traits");
    expect(controls).toContain("Clear all");
    expect(filters).toContain("Search compatible frontends");
    expect(filters).not.toContain("Search capabilities and characteristics");
    expect(controls).toContain("metadata-options");
    expect(controls).toContain("FilterChoiceChip");
    expect(controls).toContain("metadata-disclosure");
    expect(css).toMatch(
      /\.filter-choice-chip\s*\{[^}]*min-height:\s*26px[^}]*border-radius:\s*4px/s,
    );
    expect(css).toMatch(
      /\.filter-choice:has\(input:focus-visible\) \.filter-choice-chip\s*\{[^}]*inset[^}]*var\(--color-focus-ring\)/s,
    );
    expect(css).not.toMatch(
      /\.metadata-option:focus-within \.metadata-filter-chip/,
    );
    expect(css).toMatch(
      /\.filter-choice\.selected \.filter-choice-chip\s*\{[^}]*border:\s*1px solid var\(--color-accent-teal-border\)[^}]*background:\s*var\(--color-accent-teal-bg\)/s,
    );
    expect(css).toMatch(
      /\.metadata-options\.collapsed\s*\{[^}]*max-height:\s*calc\(26px \* 4 \+ 6px \* 3\)[^}]*overflow:\s*hidden/s,
    );
    expect(css).toMatch(
      /\.tag-browser-facets\s*\{[^}]*display:\s*grid[^}]*gap:\s*12px/s,
    );
    expect(css).not.toContain(".tag-results-bounded");
    expect(css).not.toMatch(/\.tag-browser-option\s*\{[^}]*44px/s);
    expect(css).toMatch(
      /\.filter-selected-chip\s*\{[^}]*min-height:\s*26px[^}]*border-radius:\s*4px[^}]*background:\s*var\(--color-accent-teal-bg\)/s,
    );
    expect(css).toMatch(
      /\.filter-selected-chip:focus-visible\s*\{[^}]*inset[^}]*var\(--color-focus-ring\)/s,
    );
  });

  test("adds the compact legal footer to the shared filter surface", () => {
    const filters = read("src/features/catalog/components/filter-controls.tsx");
    const css = read("src/styles/catalog.css");

    expect(filters).toContain('className="filter-legal"');
    expect(filters).toContain("Tavernary");
    expect(filters).toContain("AGPL-3.0-only");
    expect(filters).toContain(
      "https://github.com/MentallyQuill/Tavernary/blob/main/LICENSE",
    );
    expect(css).toMatch(
      /\.filter-legal\s*\{[^}]*color:\s*var\(--color-text-muted\)[^}]*white-space:\s*nowrap/s,
    );
  });

  test("uses the approved semantic colors", () => {
    const tokens = read("src/styles/tokens.css");
    const css = read("src/styles/catalog.css");

    expect(tokens).toContain("--color-text-muted: #829099");
    expect(css).toMatch(
      /\.category-navigation button\s*\{[^}]*color:\s*var\(--color-text-primary\)/s,
    );
    expect(css).toMatch(
      /button\[data-category="frontend"\][\s\S]*?color:\s*var\(--color-frontend\)/s,
    );
    expect(css).toMatch(
      /\.card-identity\s*\{[^}]*color:\s*var\(--kind-color\)/s,
    );
    expect(css).toMatch(
      /\.activity-weeks i\.active\s*\{[^}]*background:\s*var\(--color-activity-current\)/s,
    );
    expect(css).toMatch(
      /\.license-osi-approved\s*\{[^}]*color:\s*var\(--color-license-open\)/s,
    );
    expect(css).toMatch(
      /\.frontend-chip\s*\{[^}]*border-color:\s*var\(--color-frontend\)[^}]*color:\s*var\(--color-frontend\)/s,
    );
    expect(css).toMatch(
      /\.chip,[\s\S]*?\.license\s*\{[^}]*border:\s*1px solid var\(--color-border-strong\)[^}]*color:\s*var\(--color-text-secondary\)/s,
    );
    expect(css).toMatch(
      /\.brand-name\s*\{[^}]*color:\s*var\(--color-functional\)/s,
    );
    expect(css).toMatch(
      /\.submit-link\s*\{[^}]*color:\s*var\(--color-action-primary-text\)[^}]*background:\s*var\(--color-action-primary-bg\)/s,
    );
    expect(css).toMatch(
      /\.site-search input\s*\{[^}]*appearance:\s*none[^}]*outline:\s*0[^}]*box-shadow:\s*none/s,
    );
  });

  test("uses the approved trihex geometry", () => {
    const css = read("src/styles/catalog.css");
    const responsive = read("src/styles/responsive.css");

    expect(css).toMatch(
      /\.brand-logo\s*\{[^}]*width:\s*52px[^}]*height:\s*52px[^}]*transform:\s*none/s,
    );
    expect(responsive).toMatch(
      /@media \(max-width:\s*760px\)[\s\S]*?\.brand-logo\s*\{[^}]*width:\s*48px[^}]*height:\s*48px[^}]*transform:\s*none/,
    );
  });

  test("uses the approved lean tactile motion vocabulary", () => {
    const css = read("src/styles/catalog.css");
    const responsive = read("src/styles/responsive.css");
    const builder = read("src/features/kits/components/kit-builder.tsx");

    expect(css).toContain("--kit-motion-press: 80ms");
    expect(css).toContain("--kit-motion-state: 120ms");
    expect(css).toContain("--kit-motion-card: 150ms");
    expect(css).toContain("--kit-motion-panel: 220ms");
    expect(css).toContain("--kit-motion-ease: cubic-bezier(0.2, 0.8, 0.2, 1)");
    expect(css).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?translateY\(-2px\)/,
    );
    expect(css).toMatch(
      /\.kit-builder-row:has\(\.kit-drag-handle:is\(:hover, :focus-visible\)\)\s*\{[^}]*transform:/s,
    );
    expect(css).toMatch(/\.kit-drag-ghost\s*\{[^}]*transition:\s*none/s);
    expect(builder).toContain('className="kit-project-count"');
    expect(css).toMatch(
      /\.kit-project-count\s*\{[^}]*animation:[^}]*var\(--kit-motion-state\)/s,
    );
    expect(css).toContain("scale(1.02)");
    expect(responsive).toContain("@media (prefers-reduced-motion: reduce)");
    expect(`${css.slice(css.indexOf(".kit-grid"))}\n${responsive}`).not.toMatch(
      /\b(?:spring|bounce|rotate|filter:\s*blur)\b/i,
    );
  });

  test("positions the orange Kit count beside the plus-sized upvote", () => {
    const css = read("src/styles/catalog.css");

    expect(css).toMatch(
      /\.kit-card\s*\{[^}]*position:\s*relative[^}]*display:\s*grid/s,
    );
    expect(css).toMatch(
      /\.kit-upvote-cluster\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*4px[^}]*right:\s*4px[^}]*display:\s*flex[^}]*align-items:\s*center/s,
    );
    expect(css).toMatch(
      /\.kit-upvote-count\s*\{[^}]*border:\s*0[^}]*color:\s*var\(--color-functional\)[^}]*background:\s*transparent[^}]*font-variant-numeric:\s*tabular-nums/s,
    );
    expect(css).toMatch(
      /\.kit-card-actions\s*\{[^}]*padding-right:\s*88px[^}]*padding-top:\s*10px/s,
    );
  });
});
