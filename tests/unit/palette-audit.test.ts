import { expect, test } from "vitest";

import {
  APPROVED_HEX,
  auditProductionPalette,
  auditSource,
} from "../../scripts/audit-palette.mjs";

test("accepts the exact Graphite Teal palette", () => {
  expect(APPROVED_HEX).toContain("#0D1117");
  expect(APPROVED_HEX).toContain("#2DD4BF");
  expect(APPROVED_HEX).toContain("#D62839");
  expect(APPROVED_HEX).toContain("#57C5A3");
  expect(APPROVED_HEX).toContain("#E18A24");
  expect(APPROVED_HEX).not.toContain("#07181D");

  const source = [
    ...APPROVED_HEX.map((color) => `.x{color:${color}}`),
    ".x{color:transparent;fill:currentColor;border-color:inherit}",
    ".tooltip{opacity:0}.tooltip.visible{opacity:1}",
  ].join("\n");

  expect(auditSource("src/styles/example.css", source)).toEqual([]);
});

test("allows only the approved activity interpolation", () => {
  const approved =
    ".commit-age{color:color-mix(in srgb,var(--color-text-primary) var(--commit-freshness),var(--color-activity-recent))}";
  expect(auditSource("src/styles/catalog.css", approved)).toEqual([]);
  expect(
    auditSource(
      "src/styles/catalog.css",
      approved.replace("--color-activity-recent", "--color-text-muted"),
    ),
  ).not.toEqual([]);
});

test("allows translucent black only in the canonical shadow tokens", () => {
  const tokens = [
    ":root {",
    "--shadow-card: 0 1px 2px rgb(0 0 0 / 24%), 0 4px 12px rgb(0 0 0 / 12%);",
    "--shadow-overlay: 0 12px 32px rgb(0 0 0 / 40%);",
    "}",
  ].join("\n");
  expect(auditSource("src/styles/tokens.css", tokens)).toEqual([]);
  expect(
    auditSource(
      "src/styles/catalog.css",
      ".x{box-shadow:0 1px 2px rgb(0 0 0 / 24%)}",
    ),
  ).not.toEqual([]);
  expect(
    auditSource("src/styles/tokens.css", tokens.replace("24%", "25%")),
  ).not.toEqual([]);
});

test("ignores color names in prose, selectors, and comments", () => {
  const source = [
    'const label = "red tan white";',
    ".red-card { content: 'white'; }",
    "/* blue is a project label, not a color declaration */",
  ].join("\n");

  expect(auditSource("src/components/example.tsx", source)).toEqual([]);
});

test("ignores color syntax in comments and asset URLs", () => {
  const source = [
    "/* #fff rgb(0 0 0) opacity:.5 */",
    '.hero{background:url("/assets/red-banner.png")}',
    ':root{--hero-image:url("/assets/red-banner.png")}',
    "/* :root{--documented-color:red} */",
  ].join("\n");

  expect(auditSource("src/styles/example.css", source)).toEqual([]);
  expect(
    auditSource(
      "src/components/example.tsx",
      "// color: red; #fff rgb(0 0 0) opacity:.5",
    ),
  ).toEqual([]);
});

test("does not mistake an unquoted CSS URL for a line comment", () => {
  const source = ".x{background:url(https://example.test/a.png) #fff}";

  expect(auditSource("src/styles/example.css", source)).not.toEqual([]);
});

test.each([
  ["off-palette hex", ".x{color:#54AD94}"],
  ["rgb", ".x{color:rgb(7 24 29 / .96)}"],
  ["rgba", ".x{box-shadow:0 0 2px rgba(0,0,0,.4)}"],
  ["named color", ".x{color:white}"],
  [
    "named color hidden behind a custom property",
    ":root{--rogue:red}.x{color:var(--rogue)}",
  ],
  ["extra color mix", ".x{color:color-mix(in srgb,red 50%,blue)}"],
  ["partial opacity", ".x{opacity:.5}"],
  ["SVG partial opacity", '<path opacity=".5" />'],
  ["filter opacity", ".x{filter:opacity(.5)}"],
  ["SVG fill opacity", '<path fillOpacity=".5" />'],
  ["SVG stroke opacity", '<path stroke-opacity=".5" />'],
  ["hwb", ".x{color:hwb(0 0% 0%)}"],
  ["lab", ".x{color:lab(50% 20 30)}"],
  ["lch", ".x{color:lch(50% 20 30)}"],
  ["oklab", ".x{color:oklab(50% .1 .1)}"],
  ["oklch", ".x{color:oklch(50% .1 30)}"],
  ["color function", ".x{color:color(display-p3 1 0 0)}"],
])("rejects %s", (_name, source) => {
  expect(auditSource("src/styles/example.css", source)).not.toEqual([]);
});

test("finds no unauthorized colors in production sources", async () => {
  expect(await auditProductionPalette()).toEqual([]);
});
