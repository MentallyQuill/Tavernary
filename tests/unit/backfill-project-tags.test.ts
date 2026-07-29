import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

import {
  planTagBackfill,
  writeTagMigrationReport,
} from "../../scripts/catalog/backfill-project-tags.mjs";
import type { TagBackfillProject } from "../../scripts/catalog/backfill-project-tags.mjs";
import { tagVocabularyHash } from "../../scripts/catalog/tag-vocabulary.mjs";
import type { TagVocabulary } from "../../scripts/catalog/tag-vocabulary.mjs";

const vocabulary: TagVocabulary = {
  schema_version: 1,
  tags: [
    {
      id: "maintain-long-term-memory",
      label: "Maintain long-term memory",
      facet: "goal" as const,
      description: "Preserve important context.",
      aliases: ["durable memory"],
      applicable_kinds: ["extension", "preset"],
      inclusion_guidance: ["Evidence describes durable memory."],
      exclusion_guidance: ["Not ordinary chat history."],
    },
    {
      id: "local-first",
      label: "Local-first",
      facet: "trait" as const,
      description: "Keep data on the user's device.",
      aliases: ["on-device"],
      applicable_kinds: ["frontend", "extension"],
      inclusion_guidance: ["Evidence explicitly promises local storage."],
      exclusion_guidance: ["Do not infer from local installation."],
    },
  ],
};

const hash = tagVocabularyHash(vocabulary);

function project(
  id: string,
  enrichmentPolicy: "automatic" | "manual" = "automatic",
): TagBackfillProject {
  return {
    schema_version: 5,
    id,
    name: id,
    kind: "extension" as const,
    summary: "A trusted fixture summary.",
    enrichment_policy: enrichmentPolicy,
    ...(enrichmentPolicy === "manual"
      ? {
          enrichment_note:
            "Owner-authored catalog details approved through issue #144.",
        }
      : {}),
  };
}

function result(
  projectId: string,
  tags = ["local-first", "maintain-long-term-memory"],
) {
  return {
    project_id: projectId,
    vocabulary_hash: hash,
    tags,
    evidence: Object.fromEntries(
      tags.map((tag) => [tag, [`README evidence for ${tag}.`]]),
    ),
    diagnostic: null,
  };
}

test("maps legacy summary policy independently from automatic tags", () => {
  const plan = planTagBackfill({
    projects: [project("owner-edited", "manual")],
    vocabulary,
    classifierResults: [result("owner-edited")],
  });

  expect(plan.metadataByProjectId.get("owner-edited")).toEqual({
    tags: ["maintain-long-term-memory", "local-first"],
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "Owner-authored catalog details approved through issue #144.",
      },
      tags: { mode: "automatic" },
    },
  });
  expect(plan.report.projects[0]).toMatchObject({
    project_id: "owner-edited",
    tags: ["maintain-long-term-memory", "local-first"],
    evidence: {
      "maintain-long-term-memory": [
        "README evidence for maintain-long-term-memory.",
      ],
      "local-first": ["README evidence for local-first."],
    },
  });
});

test("requires one classifier result for every automatic tag policy", () => {
  expect(() =>
    planTagBackfill({
      projects: [project("card-a"), project("card-b")],
      vocabulary,
      classifierResults: [result("card-a")],
    }),
  ).toThrow("card-b: missing tag result");
});

test("rejects stale, duplicate, and inapplicable classifier output", () => {
  expect(() =>
    planTagBackfill({
      projects: [project("card-a")],
      vocabulary,
      classifierResults: [
        {
          ...result("card-a"),
          vocabulary_hash: "stale-hash",
        },
      ],
    }),
  ).toThrow("card-a: tag result vocabulary hash does not match");

  expect(() =>
    planTagBackfill({
      projects: [
        {
          ...project("preset-a"),
          kind: "preset" as const,
        },
      ],
      vocabulary,
      classifierResults: [result("preset-a", ["local-first", "local-first"])],
    }),
  ).toThrow("preset-a: invalid tag result");
});

test("allows trusted manual tags without invoking the classifier", () => {
  const plan = planTagBackfill({
    projects: [project("manual-tags")],
    vocabulary,
    classifierResults: [],
    manualTagsByProjectId: new Map([
      [
        "manual-tags",
        {
          tags: ["local-first"],
          authorityType: "repository-owner" as const,
        },
      ],
    ]),
  });

  expect(plan.metadataByProjectId.get("manual-tags")).toEqual({
    tags: ["local-first"],
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: {
        mode: "manual",
        note: "Verified repository owner selection.",
      },
    },
  });
});

test("rejects unexpected classifier results and missing evidence", () => {
  expect(() =>
    planTagBackfill({
      projects: [project("card-a")],
      vocabulary,
      classifierResults: [result("card-a"), result("unknown-card")],
    }),
  ).toThrow("unexpected tag result for unknown-card");

  expect(() =>
    planTagBackfill({
      projects: [project("card-a")],
      vocabulary,
      classifierResults: [
        {
          ...result("card-a", ["local-first"]),
          evidence: {},
        },
      ],
    }),
  ).toThrow("card-a: invalid tag result");

  expect(() =>
    planTagBackfill({
      projects: [project("card-a")],
      vocabulary,
      classifierResults: [
        {
          ...result("card-a", []),
          evidence: {
            "local-first": ["Evidence for an unselected tag."],
          },
        },
      ],
    }),
  ).toThrow(
    "card-a: invalid tag result: evidence keys do not match selected tags",
  );
});

test("produces a deterministic distribution report including zero-tag cards", () => {
  const plan = planTagBackfill({
    projects: [project("zero-card"), project("memory-card")],
    vocabulary,
    classifierResults: [
      result("zero-card", []),
      result("memory-card", ["maintain-long-term-memory"]),
    ],
  });

  expect(plan.report).toMatchObject({
    schema_version: 1,
    vocabulary_hash: hash,
    project_count: 2,
    zero_tag_count: 1,
    six_tag_count: 0,
    policy_counts: {
      summary: { automatic: 2, manual: 0 },
      tags: { automatic: 2, manual: 0 },
    },
    tag_counts: {
      "local-first": 0,
      "maintain-long-term-memory": 1,
    },
  });
  expect(plan.report.projects.map(({ project_id }) => project_id)).toEqual([
    "memory-card",
    "zero-card",
  ]);
});

test("writes the migration report atomically without changing projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-tag-backfill-"));
  const outputPath = resolve(root, "data/reports/tag-migration-report.json");
  const plan = planTagBackfill({
    projects: [project("card-a")],
    vocabulary,
    classifierResults: [result("card-a", [])],
  });

  try {
    const written = await writeTagMigrationReport(plan.report, outputPath);

    expect(written).toEqual({ written: true, path: outputPath });
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(plan.report);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
