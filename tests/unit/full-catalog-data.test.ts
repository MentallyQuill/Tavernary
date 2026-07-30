import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { buildCatalog } from "../../scripts/catalog/build.mjs";
import { validateEnrichmentOutput } from "../../scripts/catalog/enrichment-contract.mjs";
import { classificationError } from "../../src/features/catalog/primary-function-contract.mjs";

interface MetadataPolicy {
  mode: "automatic" | "manual";
  note?: string;
}

interface CatalogRecord {
  schema_version: number;
  id: string;
  source_id: string;
  kind: "frontend" | "extension" | "preset";
  metadata_status: "provisional" | "curated";
  primary_function: string;
  summary: string;
  tags: string[];
  listing_status: "active" | "quarantined" | "retired";
  listing_status_reason: string | null;
  metadata_policy: {
    summary: MetadataPolicy;
    tags: MetadataPolicy;
  };
}

interface SourceRecord {
  schema_version: number;
  id: string;
  type: "codeberg" | "github" | "github-organization" | "url";
  status: "active" | "delisted";
  status_reason: string | null;
  refresh_policy: "automatic" | "paused";
  url?: string;
}

interface TagDefinition {
  id: string;
  applicable_kinds: CatalogRecord["kind"][];
}

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function readJsonDirectory<T>(relativePath: string): Promise<T[]> {
  const directory = resolve(rootDirectory, relativePath);
  return Promise.all(
    (await readdir(directory))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map(async (file) =>
        JSON.parse(await readFile(resolve(directory, file), "utf8")),
      ),
  );
}

async function loadProductionData() {
  const [projects, sources, vocabulary] = await Promise.all([
    readJsonDirectory<CatalogRecord>("data/registry/projects"),
    readJsonDirectory<SourceRecord>("data/registry/sources"),
    readFile(
      resolve(rootDirectory, "data/vocabularies/tags.json"),
      "utf8",
    ).then(
      (serialized) =>
        JSON.parse(serialized) as {
          schema_version: number;
          tags: TagDefinition[];
        },
    ),
  ]);
  return {
    projects,
    sources,
    vocabulary,
    projectsById: new Map(projects.map((project) => [project.id, project])),
    sourcesById: new Map(sources.map((source) => [source.id, source])),
  };
}

function countBy<T>(records: T[], selector: (record: T) => string) {
  const counts = new Map<string, number>();
  for (const record of records) {
    const key = selector(record);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

describe("full catalog data", () => {
  test("matches the canonical schema-v6 source-backed catalog contract", async () => {
    const { projects, sources, vocabulary, sourcesById } =
      await loadProductionData();
    const tagsById = new Map(vocabulary.tags.map((tag) => [tag.id, tag]));

    expect(projects).toHaveLength(309);
    expect(sources).toHaveLength(309);
    expect(new Set(projects.map(({ id }) => id)).size).toBe(projects.length);
    expect(new Set(sources.map(({ id }) => id)).size).toBe(sources.length);
    expect(countBy(projects, ({ kind }) => kind)).toEqual({
      extension: 278,
      frontend: 17,
      preset: 14,
    });
    expect(countBy(sources, ({ type }) => type)).toEqual({
      codeberg: 1,
      github: 298,
      "github-organization": 1,
      url: 9,
    });

    for (const project of projects) {
      expect(project.schema_version, project.id).toBe(6);
      expect(sourcesById.has(project.source_id), project.id).toBe(true);
      expect(
        classificationError(project.kind, project.primary_function),
        project.id,
      ).toBeNull();
      expect(project.tags.length, project.id).toBeLessThanOrEqual(6);
      expect(new Set(project.tags).size, project.id).toBe(project.tags.length);
      for (const id of project.tags) {
        const definition = tagsById.get(id);
        expect(definition, `${project.id}: ${id}`).toBeDefined();
        expect(definition?.applicable_kinds, `${project.id}: ${id}`).toContain(
          project.kind,
        );
      }
      for (const policy of Object.values(project.metadata_policy)) {
        expect(["automatic", "manual"], project.id).toContain(policy.mode);
        if (policy.mode === "manual") {
          expect(policy.note?.trim().length, project.id).toBeGreaterThan(0);
        } else {
          expect(policy.note, project.id).toBeUndefined();
        }
      }
      for (const removed of [
        "source",
        "capabilities",
        "visibility",
        "refresh_policy",
        "enrichment_policy",
        "enrichment_note",
      ]) {
        expect(project, `${project.id}: ${removed}`).not.toHaveProperty(
          removed,
        );
      }
    }

    expect(
      projects.reduce((count, project) => count + project.tags.length, 0),
    ).toBe(793);
    expect(projects.filter(({ tags }) => tags.length === 0)).toHaveLength(16);
    expect(
      projects.filter(
        ({ metadata_policy }) => metadata_policy.tags.mode === "manual",
      ),
    ).toHaveLength(0);
  });

  test("keeps the tag migration audit tied to concrete catalog evidence", async () => {
    const report = JSON.parse(
      await readFile(
        resolve(rootDirectory, "data/reports/tag-migration-report.json"),
        "utf8",
      ),
    ) as {
      project_count: number;
      zero_tag_count: number;
      six_tag_count: number;
      projects: Array<{
        project_id: string;
        tags: string[];
        evidence: Record<string, string[]>;
      }>;
    };
    const { projectsById } = await loadProductionData();

    expect(report.project_count).toBe(309);
    expect(report.zero_tag_count).toBe(16);
    expect(report.six_tag_count).toBe(17);
    expect(report.projects).toHaveLength(309);
    for (const entry of report.projects) {
      expect(entry.tags, entry.project_id).toEqual(
        projectsById.get(entry.project_id)?.tags,
      );
      for (const references of Object.values(entry.evidence)) {
        for (const reference of references) {
          expect(reference, entry.project_id).not.toMatch(
            /\bundefined repository\b/iu,
          );
        }
      }
    }
  });

  test("keeps source lifecycle independent from card lifecycle", async () => {
    const { projects, sources, sourcesById } = await loadProductionData();
    const delisted = sources.filter(({ status }) => status === "delisted");

    expect(delisted.map(({ id }) => id).sort()).toEqual([
      "github-1175156845",
      "github-1221880270",
    ]);
    for (const source of delisted) {
      expect(source).toMatchObject({
        status_reason: "removed",
        refresh_policy: "paused",
      });
      expect(
        projects.filter(({ source_id }) => source_id === source.id),
      ).toEqual([
        expect.objectContaining({
          listing_status: "active",
          listing_status_reason: null,
        }),
      ]);
    }
    expect(
      projects.every((project) => sourcesById.has(project.source_id)),
    ).toBe(true);

    const catalog = await buildCatalog({ write: false });
    expect(catalog.projects.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining([
        "prolix-oc-lumiverse-chatroom",
        "prolix-oc-lumiverse-spotifycontrols",
      ]),
    );
  });

  test("preserves trusted manual summaries while keeping tags automatic", async () => {
    const { projectsById } = await loadProductionData();
    const expectedManualSummaryIds = [
      "evening-truth-carrd-prompt",
      "lazuli-s-sillytavern-worldinfodrawer",
      "le-emotionalism-1-1-5-prompt",
      "mentallyquill-st-wandlight",
      "puras-director-v15",
      "purrfect-logic-4-max-mini",
      "realistic-frankenstein-preset",
      "reddit-1v72pju",
      "tavern-rpg-suite",
      "village-maker-google-drive-prompt",
      "wewwaistyping-slayimages",
      "writers-block-4",
    ];

    expect(
      [...projectsById.values()]
        .filter(
          ({ metadata_policy }) => metadata_policy.summary.mode === "manual",
        )
        .map(({ id }) => id)
        .sort(),
    ).toEqual(expectedManualSummaryIds);
    for (const id of expectedManualSummaryIds) {
      expect(projectsById.get(id)?.metadata_policy.tags).toEqual({
        mode: "automatic",
      });
    }
    expect(projectsById.get("mentallyquill-st-wandlight")?.summary).toBe(
      "Wandlight is a lightweight SillyTavern preset designed for Harry Potter roleplay and fanfiction writing. It offers streamlined configuration to support immersive magical world storytelling with minimal complexity.",
    );
  });

  test("keeps Reddit source enrichment automatic without granting submitter prose authority", async () => {
    const { projectsById, sourcesById } = await loadProductionData();
    const project = projectsById.get("reddit-1v64r6z");
    const source = project ? sourcesById.get(project.source_id) : undefined;

    expect(project).toMatchObject({
      metadata_policy: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
    });
    expect(source).toMatchObject({
      type: "url",
      status: "active",
      url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update_writers_block_5_a_prose_and_narrative/",
    });
  });

  test("keeps Village Maker consolidated under one card", async () => {
    const { projectsById } = await loadProductionData();
    for (const removed of [
      "village-maker-anonpaste-prompt",
      "village-maker-harrow-hundred-prompt",
      "village-maker-thornbeck-prompt",
    ]) {
      expect(projectsById.has(removed), removed).toBe(false);
    }
    expect(projectsById.get("village-maker-google-drive-prompt")).toMatchObject(
      {
        kind: "preset",
        primary_function: "preset",
        tags: expect.arrayContaining([
          "create-character-cards",
          "build-worlds-and-lore",
        ]),
      },
    );
  });

  test("builds every effectively public project and published Kit", async () => {
    const kitRecords = await readJsonDirectory<{
      id: string;
      status: string;
    }>("data/registry/kits");
    const catalog = await buildCatalog({ write: false });

    expect(catalog.schemaVersion).toBe(4);
    expect(catalog.projects).toHaveLength(307);
    expect(catalog.tagVocabulary).toHaveLength(55);
    expect(catalog.kits.map(({ id }) => id)).toEqual(
      kitRecords
        .filter(({ status }) => status === "published")
        .map(({ id }) => id)
        .sort(),
    );
  });

  test("keeps every summary within the card presentation contract", async () => {
    const { projects } = await loadProductionData();
    for (const project of projects) {
      expect(project.summary, project.id).toBeTypeOf("string");
      expect(project.summary.trim().length, project.id).toBeGreaterThan(0);
      expect(project.summary.length, project.id).toBeLessThanOrEqual(220);
      expect(project.summary, project.id).not.toMatch(/[\r\n\u2028\u2029]/u);
    }
  });

  test("validates the contract used by generated curated summaries and tags", async () => {
    const { vocabulary } = await loadProductionData();
    const result = validateEnrichmentOutput(
      {
        summary: {
          value:
            "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
          evidence: ["readme:1-4"],
        },
        tags: [],
        result: "accepted-unchanged",
        change_reasons: [],
        policy_signal: "none",
      },
      {
        requestedFields: ["summary", "tags"],
        kind: "extension",
        tagVocabulary: vocabulary,
        copyContext: {
          mode: "synthesize",
          submittedSummary: "",
          protectedTerms: ["Fixture"],
        },
      },
    );

    expect(result).toEqual({ valid: true });
  });
});
