import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function declarations(source: string) {
  return Object.fromEntries(
    [...source.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  );
}

function palette() {
  const path = resolve(root, "src/styles/colorblind.css");
  const overrides = existsSync(path) ? readFileSync(path, "utf8") : "";
  const tokens = {
    ...declarations(
      readFileSync(resolve(root, "src/styles/tokens.css"), "utf8"),
    ),
    ...declarations(overrides),
  };
  function value(name: string): string {
    const token = tokens[name];
    const alias = token?.match(/^var\(--([\w-]+)\)$/);
    return alias ? value(alias[1]) : token;
  }
  return value;
}

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels.reduce(
    (total, channel, index) =>
      total + channel * [0.2126, 0.7152, 0.0722][index],
    0,
  );
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("colorblind category labels remain readable on normal and hovered cards", () => {
  const color = palette();
  for (const category of ["frontend", "preset", "functional"]) {
    for (const surface of ["color-bg-surface", "color-bg-surface-hover"]) {
      expect(
        contrast(color(`color-${category}`), color(surface)),
        `${category} against ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("colorblind text stays readable across the shared dark surfaces", () => {
  const color = palette();
  for (const foreground of [
    "color-text-primary",
    "color-text-secondary",
    "color-text-muted",
    "color-control-placeholder",
  ]) {
    for (const surface of [
      "color-bg-canvas",
      "color-bg-header",
      "color-bg-sidebar",
      "color-bg-surface",
      "color-bg-surface-hover",
      "color-bg-overlay",
      "color-accent-teal-bg-hover",
      "color-frontend-bg-hover",
      "color-preset-bg-hover",
      "color-functional-bg-hover",
    ]) {
      expect(
        contrast(color(foreground), color(surface)),
        `${foreground} against ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("colorblind controls and focus rings remain visible against adjacent surfaces", () => {
  const color = palette();
  for (const foreground of [
    "color-accent-teal-border",
    "color-action-secondary-border",
    "color-control-border",
    "color-control-border-hover",
    "color-control-border-focus",
    "color-checkbox-border",
    "color-checkbox-checked",
    "color-focus-ring",
  ]) {
    for (const surface of [
      "color-bg-surface",
      "color-bg-surface-hover",
      "color-control-bg",
      "color-control-bg-hover",
      "color-checkbox-bg",
    ]) {
      expect(
        contrast(color(foreground), color(surface)),
        `${foreground} against ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
  }
});

test("the colorblind palette preserves every TavernKeeper status hue", () => {
  const color = palette();
  const expected = {
    "color-tavernkeeper-teal": "#2DD4BF",
    "color-tavernkeeper-orange": "#E18A24",
    "color-tavernkeeper-red": "#F85149",
    "color-tavernkeeper-gray": "#829099",
    "color-tavernkeeper-unsupported": "#28635E",
    "color-tavernkeeper-stale-clock-bg": "#0D1117",
  };
  for (const [name, value] of Object.entries(expected)) {
    expect(color(name), name).toBe(value);
  }
});

test("colorblind status labels meet text contrast on normal and hovered cards", () => {
  const color = palette();
  for (const foreground of [
    "color-success",
    "color-warning",
    "color-danger",
    "color-info",
    "color-license-open",
    "color-license-proprietary",
    "color-license-missing",
  ]) {
    for (const surface of ["color-bg-surface", "color-bg-surface-hover"]) {
      expect(
        contrast(color(foreground), color(surface)),
        `${foreground} against ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("colorblind semantic badges preserve readable labels and visible borders", () => {
  const color = palette();
  for (const category of ["frontend", "preset", "functional"]) {
    for (const surface of [
      `color-${category}-bg`,
      `color-${category}-bg-hover`,
      "color-bg-surface",
      "color-bg-surface-hover",
    ]) {
      expect(
        contrast(color(`color-${category}-text`), color(surface)),
        `${category} badge label against ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(color(`color-${category}-border`), color(surface)),
        `${category} badge border against ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
  }
});

test("colorblind primary actions retain readable text through hover and press", () => {
  const color = palette();
  for (const surface of [
    "color-action-primary-bg",
    "color-action-primary-hover",
    "color-action-primary-pressed",
  ]) {
    expect(
      contrast(color("color-action-primary-text"), color(surface)),
      `primary action text against ${surface}`,
    ).toBeGreaterThanOrEqual(4.5);
  }
  expect(
    contrast(
      color("color-checkbox-checkmark"),
      color("color-checkbox-checked"),
    ),
  ).toBeGreaterThanOrEqual(3);
});
