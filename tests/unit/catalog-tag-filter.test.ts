import { expect, test } from "vitest";

import {
  legacyCapabilityTagIds,
  matchesSelectedTags,
} from "../../src/features/catalog/catalog-tag-filter";
import type { PublicTagDefinition } from "../../src/features/catalog/tag-vocabulary";

const vocabulary: PublicTagDefinition[] = [
  {
    id: "maintain-long-term-memory",
    label: "Maintain long-term memory",
    facet: "goal",
    description: "Preserve context over time.",
    aliases: ["memory", "persistent context"],
    applicable_kinds: ["extension", "preset"],
  },
  {
    id: "generate-images",
    label: "Generate images",
    facet: "goal",
    description: "Create roleplay artwork.",
    aliases: ["image generation"],
    applicable_kinds: ["frontend", "extension"],
  },
  {
    id: "local-first",
    label: "Local-first",
    facet: "trait",
    description: "Keep data on the user's device.",
    aliases: ["on-device", "local data"],
    applicable_kinds: ["frontend", "extension"],
  },
  {
    id: "private-storage",
    label: "Private storage",
    facet: "trait",
    description: "Store sensitive data privately.",
    aliases: ["local data"],
    applicable_kinds: ["frontend", "extension"],
  },
];

test("uses OR within each facet and AND between facets", () => {
  expect(
    matchesSelectedTags(
      ["maintain-long-term-memory", "generate-images", "local-first"],
      ["generate-images", "local-first"],
      vocabulary,
    ),
  ).toBe(true);
  expect(
    matchesSelectedTags(
      ["maintain-long-term-memory", "local-first"],
      ["maintain-long-term-memory"],
      vocabulary,
    ),
  ).toBe(false);
  expect(
    matchesSelectedTags(
      ["maintain-long-term-memory", "generate-images"],
      ["generate-images"],
      vocabulary,
    ),
  ).toBe(true);
  expect(
    matchesSelectedTags(
      ["local-first"],
      ["maintain-long-term-memory", "local-first"],
      vocabulary,
    ),
  ).toBe(true);
});

test("rejects unknown selected IDs instead of silently weakening filters", () => {
  expect(matchesSelectedTags(["unknown"], ["unknown"], vocabulary)).toBe(false);
  expect(matchesSelectedTags([], [], vocabulary)).toBe(true);
});

test("maps legacy capabilities only through one exact normalized alias", () => {
  expect(
    legacyCapabilityTagIds(
      ["image-generation", "LOCAL_DATA", "multi-frontend"],
      vocabulary,
    ),
  ).toEqual(["generate-images"]);
});

test("returns tags in vocabulary order and removes duplicate legacy values", () => {
  expect(
    legacyCapabilityTagIds(
      ["image generation", "memory", "image-generation"],
      vocabulary,
    ),
  ).toEqual(["maintain-long-term-memory", "generate-images"]);
});

test("migrates only the legacy capabilities with an intentional tag alias", async () => {
  const trackedVocabulary = JSON.parse(
    await readFile(resolve("data/vocabularies/tags.json"), "utf8"),
  ) as { tags: PublicTagDefinition[] };

  expect(
    legacyCapabilityTagIds(
      [
        "automation",
        "character-worldbuilding",
        "extension-development",
        "image-generation",
        "instruction-control",
        "model-routing",
        "multi-frontend",
        "planning-reasoning",
        "prompt-engineering",
        "review-validation",
      ],
      trackedVocabulary.tags,
    ),
  ).toEqual([
    "build-worlds-and-lore",
    "guide-model-responses",
    "add-structured-reasoning",
    "route-tasks-across-models",
    "manage-prompts-and-presets",
    "automate-roleplay-workflows",
    "generate-images",
    "inspect-prompts-and-generations",
    "build-extensions-and-scripts",
  ]);
});
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
