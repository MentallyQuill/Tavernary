import { describe, expect, test } from "vitest";

import {
  containsDisallowedKitLanguage,
  severeLanguageTerms,
} from "@/features/kits/severe-language-policy.mjs";

describe("Kit severe-language policy", () => {
  test.each(["nigger", "kike", "faggot", "tranny", "retard"])(
    "blocks representative severe term %s",
    (term) => {
      expect(containsDisallowedKitLanguage(`A ${term} Kit`)).toBe(true);
    },
  );

  test.each([
    "NIGGER",
    "n!i!g!g!e!r",
    "n i g g e r",
    "n1gg3r",
    "fa\u0301ggot",
  ])("blocks normalized disguise %s", (text) => {
    expect(containsDisallowedKitLanguage(text)).toBe(true);
  });

  test.each([
    "Damn Good Stories",
    "Badass Character Kit",
    "This shit actually works.",
    "Assassin toolkit",
    "Classic adult roleplay tools.",
    "Retardant material reference",
  ])("allows intentionally permitted text %s", (text) => {
    expect(containsDisallowedKitLanguage(text)).toBe(false);
  });

  test("keeps the policy explicit, unique, and normalized", () => {
    expect(severeLanguageTerms.length).toBeGreaterThan(0);
    expect(new Set(severeLanguageTerms).size).toBe(severeLanguageTerms.length);
    expect(severeLanguageTerms).toEqual(
      [...severeLanguageTerms].sort((left, right) =>
        left.localeCompare(right),
      ),
    );
    expect(
      severeLanguageTerms.every((term) => /^[a-z]+$/u.test(term)),
    ).toBe(true);
  });
});
