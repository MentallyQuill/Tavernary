import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const tokensSource = readFileSync(
  resolve(root, "src/styles/tokens.css"),
  "utf8",
);
const themeTokenContractSource = readFileSync(
  resolve(root, "tests/unit/theme-token-contract.test.ts"),
  "utf8",
);

function declarations(source: string) {
  return Object.fromEntries(
    [...source.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].replace(/\s+/g, " ").trim(),
    ]),
  );
}

// prettier-ignore
const EXPECTED_THEME_TOKENS = {
  "color-bg-canvas": "#0D1117",
  "color-bg-header": "#101820",
  "color-bg-sidebar": "#121A1F",
  "color-bg-surface": "#182228",
  "color-bg-surface-raised": "#1C282E",
  "color-bg-surface-hover": "#223138",
  "color-bg-surface-active": "#153B39",
  "color-bg-input": "#10191E",
  "color-bg-overlay": "#202C32",
  "color-bg-disabled": "#171F23",
  "color-border-subtle": "#223038",
  "color-border-default": "#2B3A40",
  "color-border-strong": "#3E535B",
  "color-border-hover": "#506870",
  "color-divider": "#26363D",
  "color-text-primary": "#E6EDF3",
  "color-text-secondary": "#A8B3BA",
  "color-text-muted": "#829099",
  "color-text-disabled": "#5F6B72",
  "color-text-inverse": "#0D1117",
  "color-heading": "#F0F5F7",
  "color-link": "#6EE7D8",
  "color-link-hover": "#99F6E4",
  "color-accent-teal": "#2DD4BF",
  "color-accent-teal-hover": "#5EEAD4",
  "color-accent-teal-pressed": "#14B8A6",
  "color-accent-teal-muted": "#238F85",
  "color-accent-teal-bg": "#153B39",
  "color-accent-teal-bg-hover": "#1B4A46",
  "color-accent-teal-border": "#28635E",
  "color-accent-teal-text": "#8CE9DE",
  "color-focus-ring": "#5EEAD4",
  "color-frontend": "#D62839",
  "color-frontend-hover": "#E33B4C",
  "color-frontend-pressed": "#B71F30",
  "color-frontend-bg": "#35181F",
  "color-frontend-bg-hover": "#431D25",
  "color-frontend-border": "#7C2936",
  "color-frontend-text": "#FF8B95",
  "color-preset": "#57C5A3",
  "color-preset-hover": "#72D4B6",
  "color-preset-pressed": "#3EAC8C",
  "color-preset-bg": "#15352E",
  "color-preset-bg-hover": "#1B443A",
  "color-preset-border": "#347A67",
  "color-preset-text": "#8BE0C5",
  "color-functional": "#E18A24",
  "color-functional-hover": "#F0A145",
  "color-functional-pressed": "#C87416",
  "color-functional-bg": "#3B2814",
  "color-functional-bg-hover": "#4A3217",
  "color-functional-border": "#8A5720",
  "color-functional-text": "#FFC171",
  "color-action-primary-bg": "#E18A24",
  "color-action-primary-hover": "#F0A145",
  "color-action-primary-pressed": "#C87416",
  "color-action-primary-text": "#161008",
  "color-action-secondary-bg": "#1C282E",
  "color-action-secondary-hover": "#26363D",
  "color-action-secondary-border": "#3E535B",
  "color-action-secondary-text": "#E6EDF3",
  "color-control-bg": "#10191E",
  "color-control-bg-hover": "#172329",
  "color-control-border": "#304249",
  "color-control-border-hover": "#486068",
  "color-control-border-focus": "#2DD4BF",
  "color-control-text": "#E6EDF3",
  "color-control-placeholder": "#718087",
  "color-checkbox-bg": "#121A1F",
  "color-checkbox-border": "#506168",
  "color-checkbox-checked": "#2DD4BF",
  "color-checkbox-checkmark": "#071413",
  "color-success": "#3FB950",
  "color-success-bg": "#16351F",
  "color-success-border": "#2E6B3D",
  "color-success-text": "#7EE787",
  "color-warning": "#D29922",
  "color-warning-bg": "#3A2D12",
  "color-warning-border": "#7A5B18",
  "color-warning-text": "#E3B341",
  "color-danger": "#F85149",
  "color-danger-bg": "#3D1B1F",
  "color-danger-border": "#8C2F35",
  "color-danger-text": "#FF7B72",
  "color-info": "#58A6FF",
  "color-info-bg": "#162B45",
  "color-info-border": "#315F91",
  "color-info-text": "#79C0FF",
  "color-activity-current": "#2DD4BF",
  "color-activity-recent": "#829099",
  "color-activity-dormant": "#5F6B72",
  "color-progress-track": "#26363D",
  "color-progress-fill": "#57C5A3",
  "color-license-open": "#57C5A3",
  "color-license-proprietary": "#A8B3BA",
  "color-license-missing": "#829099",
  "shadow-card":
    "0 1px 2px rgb(0 0 0 / 24%), 0 4px 12px rgb(0 0 0 / 12%)",
  "shadow-overlay": "0 12px 32px rgb(0 0 0 / 40%)",
} as const;

const LEGACY_TOKENS = [
  "color-page",
  "color-surface-primary",
  "color-surface-card",
  "color-surface-raised",
  "color-border",
  "color-navigation-primary",
  "color-muted",
  "color-filled-control-text",
  "color-kind-extension",
  "color-kind-frontend",
  "color-kind-preset",
  "shadow-raised",
] as const;

describe("Graphite Teal token contract", () => {
  test("uses local formatter boundaries for case-sensitive token literals", () => {
    expect(tokensSource).toMatch(/^\/\* prettier-ignore \*\/\r?\n:root \{/);
    expect(themeTokenContractSource).toContain(
      "// prettier-ignore\nconst EXPECTED_THEME_TOKENS = {",
    );
  });

  test("defines every approved theme token with its exact value", () => {
    const actual = declarations(tokensSource);
    expect(
      Object.fromEntries(
        Object.keys(EXPECTED_THEME_TOKENS).map((name) => [name, actual[name]]),
      ),
    ).toEqual(EXPECTED_THEME_TOKENS);
  });

  test("removes legacy color aliases while retaining layout tokens", () => {
    const actual = declarations(tokensSource);
    for (const name of LEGACY_TOKENS) expect(actual[name]).toBeUndefined();
    expect(actual.radius).toBe("8px");
    expect(actual["header-height"]).toBe("78px");
    expect(actual["category-height"]).toBe("62px");
    expect(actual["content-max"]).toBe("1520px");
  });
});
