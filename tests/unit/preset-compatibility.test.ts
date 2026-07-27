import { expect, test } from "vitest";

import {
  matchesCompletionFormats,
  matchesModelFamilies,
} from "@/features/catalog/preset-compatibility";

test("named filters do not expand Model-Agnostic metadata", () => {
  expect(matchesModelFamilies(["claude"], ["model-agnostic"])).toBe(false);
});

test("the explicit Model-Agnostic filter remains specific", () => {
  expect(matchesModelFamilies(["model-agnostic"], ["claude"])).toBe(false);
});

test("a combined-tag Preset matches each explicit filter", () => {
  const available = ["model-agnostic", "claude", "glm", "deepseek"];

  for (const selected of available) {
    expect(matchesModelFamilies([selected], available)).toBe(true);
  }
  expect(matchesModelFamilies(["gpt"], available)).toBe(false);
});

test("multiple selected model families use OR semantics", () => {
  expect(matchesModelFamilies(["claude", "gpt"], ["gpt"])).toBe(true);
});

test("completion formats use OR semantics without agnostic expansion", () => {
  expect(
    matchesCompletionFormats(["chat-completion"], ["text-completion"]),
  ).toBe(false);
});
