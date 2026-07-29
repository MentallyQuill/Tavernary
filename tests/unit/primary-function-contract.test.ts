import { describe, expect, test } from "vitest";

import primaryFunctionVocabulary from "../../data/vocabularies/primary-functions.json";
import {
  EXTENSION_PRIMARY_FUNCTION_IDS,
  STRUCTURAL_PRIMARY_FUNCTIONS,
  classificationError,
} from "@/features/catalog/primary-function-contract.mjs";

describe("primary-function contract", () => {
  test.each([
    ["frontend", "frontend"],
    ["preset", "preset"],
    ["extension", "memory-retrieval"],
    ["extension", "generation-reasoning"],
    ["extension", "character-worldbuilding"],
    ["extension", "rpg-systems"],
    ["extension", "interface-workflow"],
    ["extension", "developer-infrastructure"],
  ])("accepts %s / %s", (kind, primaryFunction) => {
    expect(classificationError(kind, primaryFunction)).toBeNull();
  });

  test.each([
    ["frontend", "interface-workflow"],
    ["frontend", "preset"],
    ["preset", "generation-reasoning"],
    ["preset", "frontend"],
    ["extension", "frontend"],
    ["extension", "preset"],
    ["extension", "uncategorized"],
    ["extension", ""],
    ["unknown", "interface-workflow"],
  ])("rejects %s / %s", (kind, primaryFunction) => {
    expect(classificationError(kind, primaryFunction)).not.toBeNull();
  });

  test("exposes structural and Extension values without overlap", () => {
    expect(STRUCTURAL_PRIMARY_FUNCTIONS).toEqual({
      frontend: "frontend",
      preset: "preset",
    });
    expect(EXTENSION_PRIMARY_FUNCTION_IDS).toEqual([
      "memory-retrieval",
      "generation-reasoning",
      "character-worldbuilding",
      "rpg-systems",
      "interface-workflow",
      "developer-infrastructure",
    ]);
  });

  test("publishes the approved category definitions", () => {
    expect(primaryFunctionVocabulary.primary_functions).toEqual(
      expect.arrayContaining([
        {
          id: "preset",
          label: "System Preset",
          description:
            "A reusable System Preset with a structural Preset classification.",
        },
        {
          id: "memory-retrieval",
          label: "Memory and retrieval",
          description:
            "Stores, summarizes, searches, retrieves, or injects conversational knowledge and continuity.",
        },
        {
          id: "generation-reasoning",
          label: "Generation and reasoning",
          description:
            "Changes how model output is prompted, sampled, continued, routed, or reasoned.",
        },
        {
          id: "character-worldbuilding",
          label: "Character and worldbuilding",
          description:
            "Creates or manages characters, personas, lore, locations, expressions, or narrative-world material.",
        },
        {
          id: "rpg-systems",
          label: "RPG systems and suites",
          description:
            "Provides game mechanics, rules, progression, statistics, quests, or structured world-state systems.",
        },
        {
          id: "interface-workflow",
          label: "Interface and workflow",
          description:
            "Improves user-facing navigation, presentation, editing, productivity, accessibility, or media interaction.",
        },
        {
          id: "developer-infrastructure",
          label: "Developer infrastructure",
          description:
            "Provides developer-facing APIs, scripting, proxies, interoperability, diagnostics, build support, or operational plumbing.",
        },
      ]),
    );
  });
});
