import { expect, test } from "vitest";

import {
  matchesCompletionFormats,
  matchesModelFamilies,
} from "@/features/catalog/preset-compatibility";

test("named model filters include Model-Agnostic metadata", () => {
  expect(matchesModelFamilies(["claude"], ["model-agnostic"])).toBe(true);
});

test("the explicit Model-Agnostic filter remains specific", () => {
  expect(matchesModelFamilies(["model-agnostic"], ["claude"])).toBe(false);
});

test("multiple selected model families use OR semantics", () => {
  expect(matchesModelFamilies(["claude", "gpt"], ["gpt"])).toBe(true);
});

test("completion formats use OR semantics without agnostic expansion", () => {
  expect(
    matchesCompletionFormats(["chat-completion"], ["text-completion"]),
  ).toBe(false);
});
