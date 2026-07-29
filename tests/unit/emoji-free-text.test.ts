import { expect, test } from "vitest";

import { stripEmoji } from "@/features/catalog/emoji-free-text.mjs";

test("removes an emoji without changing surrounding text", () => {
  expect(stripEmoji("A useful tool 🧭 for writers.")).toEqual({
    value: "A useful tool  for writers.",
    removed: true,
  });
});

test.each([
  {
    label: "family and skin-tone joined sequences",
    input: "Built for 👩🏽‍💻 teams and 👨‍👩‍👧‍👦 families.",
    output: "Built for  teams and  families.",
    removed: true,
  },
  {
    label: "regional-indicator flags",
    input: "Translations: 🇯🇵 and 🇧🇷.",
    output: "Translations:  and .",
    removed: true,
  },
  {
    label: "keycaps",
    input: "Press 1️⃣ or #️⃣.",
    output: "Press  or .",
    removed: true,
  },
  {
    label: "emoji-only input",
    input: "🧭",
    output: "",
    removed: true,
  },
  {
    label: "ordinary profanity",
    input: "This damn thing works like shit.",
    output: "This damn thing works like shit.",
    removed: false,
  },
  {
    label: "accented and non-Latin prose",
    input: "Résumé — 日本語 — مرحبًا",
    output: "Résumé — 日本語 — مرحبًا",
    removed: false,
  },
  {
    label: "plain punctuation and trademark text",
    input: "Tavernary™ © 2026 — (stable).",
    output: "Tavernary™ © 2026 — (stable).",
    removed: false,
  },
])("handles $label without normalizing prose", ({ input, output, removed }) => {
  expect(stripEmoji(input)).toEqual({ value: output, removed });
});
