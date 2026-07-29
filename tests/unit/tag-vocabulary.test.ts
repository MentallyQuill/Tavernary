import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import Ajv from "ajv";
import { expect, test } from "vitest";

import type { TagVocabulary } from "../../scripts/catalog/tag-vocabulary.mjs";

const validVocabulary: TagVocabulary = {
  schema_version: 1,
  tags: [
    {
      id: "maintain-long-term-memory",
      label: "Maintain long-term memory",
      facet: "goal",
      description:
        "Preserve and retrieve important context across long conversations.",
      aliases: ["memory", "persistent context"],
      applicable_kinds: ["extension", "preset"],
      inclusion_guidance: [
        "The project explicitly stores, retrieves, consolidates, or injects durable conversation memory.",
      ],
      exclusion_guidance: [
        "Do not use for ordinary chat history display without durable memory behavior.",
      ],
    },
  ],
};

test("accepts a complete Goals-and-Traits vocabulary", async () => {
  const { validateTagVocabulary } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");

  expect(validateTagVocabulary(validVocabulary)).toEqual({
    valid: true,
    errors: [],
  });
});

test("rejects duplicate tag IDs", async () => {
  const { validateTagVocabulary } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");
  const duplicate = structuredClone(validVocabulary);
  duplicate.tags.push({
    ...structuredClone(validVocabulary.tags[0]),
    label: "Persistent memory",
    aliases: ["durable memories"],
  });

  expect(validateTagVocabulary(duplicate)).toEqual({
    valid: false,
    errors: ["tags[1].id duplicates tag ID maintain-long-term-memory."],
  });
});

test("rejects normalized aliases claimed by more than one tag", async () => {
  const { validateTagVocabulary } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");
  const duplicate = structuredClone(validVocabulary);
  duplicate.tags.push({
    ...structuredClone(validVocabulary.tags[0]),
    id: "retrieve-memories",
    label: "Retrieve memories",
    aliases: [" Persistent Context "],
  });

  expect(validateTagVocabulary(duplicate)).toEqual({
    valid: false,
    errors: [
      'tags[1].aliases[0] duplicates normalized vocabulary term "persistent context".',
    ],
  });
});

test("rejects unknown facets", async () => {
  const { validateTagVocabulary } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");
  const invalid = structuredClone(validVocabulary);
  (invalid.tags[0] as { facet: string }).facet = "implementation";

  expect(validateTagVocabulary(invalid)).toEqual({
    valid: false,
    errors: ['tags[0].facet must be "goal" or "trait".'],
  });
});

test("rejects tags without inclusion guidance", async () => {
  const { validateTagVocabulary } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");
  const invalid = structuredClone(validVocabulary);
  invalid.tags[0].inclusion_guidance = [];

  expect(validateTagVocabulary(invalid)).toEqual({
    valid: false,
    errors: ["tags[0].inclusion_guidance must contain at least one entry."],
  });
});

test("strips classifier guidance from public tag definitions", async () => {
  const { publicTagVocabulary } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");

  expect(publicTagVocabulary(validVocabulary)).toEqual([
    {
      id: "maintain-long-term-memory",
      label: "Maintain long-term memory",
      facet: "goal",
      description:
        "Preserve and retrieve important context across long conversations.",
      aliases: ["memory", "persistent context"],
      applicable_kinds: ["extension", "preset"],
    },
  ]);
});

test("indexes tags by their stable ID", async () => {
  const { indexTagVocabulary } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");

  expect(
    indexTagVocabulary(validVocabulary).get("maintain-long-term-memory"),
  ).toEqual(validVocabulary.tags[0]);
});

test("returns only tags applicable to a project kind", async () => {
  const { tagsForKind } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");
  const vocabulary = structuredClone(validVocabulary);
  vocabulary.tags.push({
    ...structuredClone(validVocabulary.tags[0]),
    id: "customizable-interface",
    label: "Customizable interface",
    facet: "trait",
    aliases: ["theming"],
    applicable_kinds: ["frontend"],
  });

  expect(tagsForKind(vocabulary, "preset").map(({ id }) => id)).toEqual([
    "maintain-long-term-memory",
  ]);
});

test("hashes the canonical vocabulary document deterministically", async () => {
  const { tagVocabularyHash } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");

  expect(tagVocabularyHash({ schema_version: 1, tags: [] })).toBe(
    "f7e0a5c7c504e1b437f7b45c6a6b5162c5127c2a19cf46a856f58f26498ec6bd",
  );
});

test("keeps the vocabulary hash stable across object key order", async () => {
  const { tagVocabularyHash } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");

  expect(tagVocabularyHash({ tags: [], schema_version: 1 })).toBe(
    tagVocabularyHash({ schema_version: 1, tags: [] }),
  );
});

test("reports missing required tag fields without throwing", async () => {
  const { validateTagVocabulary } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");
  const invalid = structuredClone(validVocabulary);
  delete (invalid.tags[0] as { aliases?: string[] }).aliases;

  expect(validateTagVocabulary(invalid)).toEqual({
    valid: false,
    errors: ["tags[0].aliases must be an array."],
  });
});

test("publishes an exact JSON schema for the vocabulary document", async () => {
  const schema = JSON.parse(
    await readFile(resolve("data/schemas/tag-vocabulary.schema.json"), "utf8"),
  );
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

  expect(validate(validVocabulary)).toBe(true);
  expect(validate({ ...validVocabulary, injected: true })).toBe(false);
});

test("starts with a valid tracked vocabulary document", async () => {
  const { validateTagVocabulary } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");
  const vocabulary = JSON.parse(
    await readFile(resolve("data/vocabularies/tags.json"), "utf8"),
  );

  expect(validateTagVocabulary(vocabulary)).toEqual({
    valid: true,
    errors: [],
  });
});

test("reports an invalid vocabulary document without throwing", async () => {
  const { validateTagVocabulary } =
    await import("../../scripts/catalog/tag-vocabulary.mjs");

  expect(validateTagVocabulary(null)).toEqual({
    valid: false,
    errors: ["tag vocabulary must be an object."],
  });
});
