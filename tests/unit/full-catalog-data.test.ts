import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { buildCatalog } from "../../scripts/catalog/build.mjs";
import { validateEnrichmentOutput } from "../../scripts/catalog/enrichment-contract.mjs";

interface CatalogRecord {
  id: string;
  kind: string;
  metadata_status: string;
  primary_function: string;
  capabilities: string[];
  summary: string;
  enrichment_policy: "automatic" | "manual";
  enrichment_note?: string;
  visibility?: string;
  source: {
    type: string;
    repository_id?: number | null;
    license_status?: string | null;
    version?: string | null;
    artifact_size_bytes?: number | null;
  };
}

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const removedVillageMakerIds = [
  "village-maker-anonpaste-prompt",
  "village-maker-harrow-hundred-prompt",
  "village-maker-thornbeck-prompt",
];

const manualCuratedRecords = {
  "le-emotionalism-1-1-5-prompt": {
    summary:
      "A modular SillyTavern preset for grounded roleplay, autonomous NPCs, deliberate reasoning, continuity, pacing, and expressive prose.",
    primary_function: "generation-reasoning",
    capabilities: [
      "prompt-engineering",
      "instruction-control",
      "planning-reasoning",
      "character-worldbuilding",
    ],
    version: "1.1.5",
    artifact_size_bytes: 146359,
  },
  "puras-director-v15": {
    summary:
      "A customizable SillyTavern preset combining director-style scene control, grounded prose, reasoning aids, trackers, and RPG systems.",
    primary_function: "generation-reasoning",
    capabilities: [
      "prompt-engineering",
      "instruction-control",
      "planning-reasoning",
      "character-worldbuilding",
    ],
    version: "15.0",
    artifact_size_bytes: null,
  },
  "purrfect-logic-4-max-mini": {
    summary:
      "A streamlined SillyTavern roleplay preset reducing prompt overhead while strengthening structure, instruction following, and prose.",
    primary_function: "generation-reasoning",
    capabilities: ["prompt-engineering", "instruction-control"],
    version: "4 Max Mini",
    artifact_size_bytes: null,
  },
  "realistic-frankenstein-preset": {
    summary:
      "A three-tier SillyTavern preset family promoting character autonomy, realistic behavior, living-world continuity, and scalable prompting.",
    primary_function: "generation-reasoning",
    capabilities: [
      "prompt-engineering",
      "instruction-control",
      "planning-reasoning",
    ],
    version: null,
    artifact_size_bytes: null,
  },
  "writers-block-4": {
    summary:
      "A SillyTavern co-writing preset with director modes, adaptive pacing, structured reasoning, prose styles, character agency, and subtext.",
    primary_function: "generation-reasoning",
    capabilities: [
      "prompt-engineering",
      "instruction-control",
      "planning-reasoning",
    ],
    version: "4",
    artifact_size_bytes: null,
  },
  "village-maker-google-drive-prompt": {
    summary:
      "An interview-driven guide for creating village-as-character cards with communities, locations, events, lore, and roleplay structure.",
    primary_function: "character-worldbuilding",
    capabilities: ["character-worldbuilding", "prompt-engineering"],
    version: "1.0",
    artifact_size_bytes: null,
  },
  "tavern-rpg-suite": {
    summary:
      "A SillyTavern extension suite adding maps, inventory, vitals, equipment, memory, minigames, and secondary-model roleplay tools.",
    primary_function: "rpg-systems",
    capabilities: [
      "automation",
      "character-worldbuilding",
      "image-generation",
      "instruction-control",
      "model-routing",
    ],
    version: undefined,
    artifact_size_bytes: undefined,
  },
} as const;

async function loadRegistryRecords(): Promise<CatalogRecord[]> {
  const directory = resolve(rootDirectory, "data/registry/projects");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(directory, file), "utf8")),
    ),
  );
}

function countBy<T>(records: T[], selector: (record: T) => string) {
  const counts = new Map<string, number>();
  for (const record of records) {
    const key = selector(record);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries(counts);
}

function expectCatalogContract(records: CatalogRecord[]) {
  const ids = new Set(records.map((record) => record.id));
  const provisionalRecords = records.filter(
    (record) => record.metadata_status === "provisional",
  );

  expect(records).toHaveLength(211);
  expect(ids.size).toBe(211);
  expect(countBy(records, (record) => record.kind)).toEqual({
    extension: 198,
    frontend: 4,
    preset: 9,
  });
  expect(countBy(records, (record) => record.source.type)).toEqual({
    github: 204,
    "github-organization": 1,
    url: 6,
  });
  expect(countBy(records, (record) => record.enrichment_policy)).toEqual({
    automatic: 204,
    manual: 7,
  });
  expect(
    records.filter(
      (record) =>
        record.source.type === "url" &&
        record.source.license_status === "pending",
    ),
  ).toHaveLength(0);
  expect(
    records.filter(
      (record) =>
        record.source.type === "url" &&
        record.source.license_status === "missing",
    ),
  ).toHaveLength(6);

  for (const record of records) {
    expect(["curated", "provisional"], record.id).toContain(
      record.metadata_status,
    );
    if (record.enrichment_policy === "automatic") {
      expect(record.enrichment_note, record.id).toBeUndefined();
    } else {
      expect(record.enrichment_note?.trim().length, record.id).toBeGreaterThan(
        0,
      );
    }
  }

  for (const record of provisionalRecords) {
    expect(record.primary_function).toBe("uncategorized");
    expect(record.capabilities).toEqual([]);
  }

  for (const record of records.filter(
    (record) => record.source.type === "github",
  )) {
    const repositoryId = record.source.repository_id;
    expect(
      repositoryId === null ||
        (Number.isInteger(repositoryId) && (repositoryId ?? 0) > 0),
      record.id,
    ).toBe(true);
    if (record.metadata_status === "curated") {
      expect(repositoryId, record.id).toEqual(expect.any(Number));
      if (record.primary_function === "uncategorized") {
        expect(record.summary, record.id).toBe("No README file found.");
        expect(record.capabilities, record.id).toEqual([]);
      }
    }
  }

  const curatedGitHubIds = [
    "mentallyquill-recursion",
    "platberlitz-sillytavern-image-gen",
    "sillytavern-sillytavern",
    "zorgonatis-stabs-edh",
  ];

  for (const id of curatedGitHubIds) {
    const record = records.find((entry) => entry.id === id);
    expect(record, `missing curated overlap record: ${id}`).toBeDefined();
    expect(record?.metadata_status).toBe("curated");
    expect(record?.source.type).toBe("github");
    expect(record?.primary_function).not.toBe("uncategorized");
    expect(record?.capabilities ?? []).not.toEqual([]);
    expect(record?.source.repository_id).toEqual(expect.any(Number));
  }

  for (const id of [
    "daddytorgo-hash-frankengarage",
    "mentallyquill-st-wandlight",
    "zorgonatis-stabs-edh",
  ]) {
    expect(records.find((record) => record.id === id)?.enrichment_policy).toBe(
      "automatic",
    );
  }

  expect(
    records.find((record) => record.id === "tavern-rpg-suite"),
  ).toMatchObject({
    enrichment_policy: "manual",
    enrichment_note: "Multi-repository suite; requires manual curation.",
  });
}

describe("full catalog data", () => {
  test("matches the consolidated 211-record contract", async () => {
    expectCatalogContract(await loadRegistryRecords());
  });

  test("keeps manual curation exact and Village Maker consolidated", async () => {
    const records = await loadRegistryRecords();
    const byId = new Map(records.map((record) => [record.id, record]));

    for (const id of removedVillageMakerIds) {
      expect(byId.has(id), id).toBe(false);
    }

    for (const [id, expected] of Object.entries(manualCuratedRecords)) {
      const record = byId.get(id);
      expect(record, id).toBeDefined();
      expect(record).toMatchObject({
        summary: expected.summary,
        metadata_status: "curated",
        primary_function: expected.primary_function,
        capabilities: expected.capabilities,
      });
      expect(record?.source.version, id).toBe(expected.version);
      expect(record?.source.artifact_size_bytes, id).toBe(
        expected.artifact_size_bytes,
      );
    }
  });

  test("allows identity preparation and progressive enrichment", async () => {
    const records = structuredClone(await loadRegistryRecords());
    const canary = records
      .filter(
        (record) =>
          record.metadata_status === "provisional" &&
          record.source.type === "github",
      )
      .slice(0, 5);

    for (const [index, record] of canary.entries()) {
      record.source.repository_id = 1_000_000 + index;
      record.metadata_status = "curated";
      record.primary_function = "developer-infrastructure";
      record.capabilities = ["automation"];
      record.summary =
        "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.";
    }

    expectCatalogContract(records);
  });

  test("keeps the production Kit registry empty before community publication", async () => {
    const catalog = await buildCatalog({ write: false });
    expect(catalog.schemaVersion).toBe(2);
    expect(catalog.kits).toEqual([]);
  });

  test("keeps every summary within the card presentation contract", async () => {
    const records = await loadRegistryRecords();
    for (const record of records as Array<{ id: string; summary: string }>) {
      expect(record.summary, record.id).toBeTypeOf("string");
      expect(record.summary.trim().length, record.id).toBeGreaterThan(0);
      expect(record.summary.length, record.id).toBeLessThanOrEqual(220);
      expect(record.summary, record.id).not.toMatch(/[\r\n\u2028\u2029]/u);
    }
  });

  test("validates the contract used by generated curated summaries", async () => {
    const primaryFunctions = JSON.parse(
      await readFile(
        resolve(rootDirectory, "data/vocabularies/primary-functions.json"),
        "utf8",
      ),
    ).primary_functions;
    const capabilities = JSON.parse(
      await readFile(
        resolve(rootDirectory, "data/vocabularies/capabilities.json"),
        "utf8",
      ),
    ).capabilities;
    const result = validateEnrichmentOutput(
      {
    summary:
      "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
        metadata_status: "curated",
        primary_function: "developer-infrastructure",
        capabilities: ["automation"],
      },
      { primaryFunctions, capabilities },
    );
    expect(result).toEqual({ valid: true });
  });
});
