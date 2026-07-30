import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";

import trackedTags from "../../data/vocabularies/tags.json";
import {
  publicTagVocabulary,
  type TagVocabulary,
} from "../../scripts/catalog/tag-vocabulary.mjs";

test("keeps classifier-only tag guidance outside the submission client", async () => {
  const [clientSource, pageSource] = await Promise.all([
    readFile(
      resolve(
        "src/features/submissions/components/project-submission-builder.tsx",
      ),
      "utf8",
    ),
    readFile(resolve("src/app/submit/project/page.tsx"), "utf8"),
  ]);

  expect(clientSource).not.toContain("data/vocabularies/tags.json");
  expect(clientSource).not.toContain("inclusion_guidance");
  expect(clientSource).not.toContain("exclusion_guidance");
  expect(pageSource).toContain("data/vocabularies/tags.json");
  expect(pageSource).toContain("publicTagVocabulary");
  expect(pageSource).toContain("tagVocabulary={publicTagVocabulary");

  const publicTags = publicTagVocabulary(trackedTags as TagVocabulary);
  expect(publicTags.length).toBeGreaterThan(0);
  for (const tag of publicTags) {
    expect(Object.keys(tag).sort()).toEqual([
      "aliases",
      "applicable_kinds",
      "description",
      "facet",
      "id",
      "label",
    ]);
  }
});
