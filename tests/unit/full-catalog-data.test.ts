import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import primaryFunctionVocabulary from "../../data/vocabularies/primary-functions.json";
import { buildCatalog } from "../../scripts/catalog/build.mjs";
import { validateEnrichmentOutput } from "../../scripts/catalog/enrichment-contract.mjs";
import { classificationError } from "../../src/features/catalog/primary-function-contract.mjs";

interface CatalogRecord {
  id: string;
  kind: string;
  metadata_status: string;
  primary_function: string;
  capabilities: string[];
  model_families?: string[];
  summary: string;
  enrichment_policy: "automatic" | "manual";
  enrichment_note?: string;
  visibility?: string;
  source: {
    type: string;
    url?: string;
    repository_id?: number | null;
    license_status?: string | null;
    version?: string | null;
    artifact_size_bytes?: number | null;
  };
}

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const supportedSourceTypes = [
  "codeberg",
  "github",
  "github-organization",
  "url",
];

const removedVillageMakerIds = [
  "village-maker-anonpaste-prompt",
  "village-maker-harrow-hundred-prompt",
  "village-maker-thornbeck-prompt",
];

const reconciledPrimaryFunctions = {
  "casus-b-casus-custom-chatfill-ii": "preset",
  "daddytorgo-hash-frankengarage": "preset",
  "evening-truth-carrd-prompt": "preset",
  "le-emotionalism-1-1-5-prompt": "preset",
  "mentallyquill-st-wandlight": "preset",
  "puras-director-v15": "preset",
  "purrfect-logic-4-max-mini": "preset",
  "realistic-frankenstein-preset": "preset",
  "reddit-1v64r6z": "preset",
  "reddit-1v72pju": "preset",
  "ryah-st-freaky-d20-preset": "preset",
  "village-maker-google-drive-prompt": "preset",
  "writers-block-4": "preset",
  "zorgonatis-stabs-edh": "preset",
  "mnehmos-mnehmos-quest-keeper-game": "frontend",
  "sagesheep-narrativeengine-p": "frontend",
  "amousepad-lumirealm": "character-worldbuilding",
  "archkr-lumiverse-lumimind": "memory-retrieval",
  "archkr-sillytavern-outfitswitch": "character-worldbuilding",
  "bronya-rand-prome-vn-extension": "interface-workflow",
  "cha1latte-marinara-avatar-background": "interface-workflow",
  "countcandy-sillytavern-extension-candyexpressions":
    "character-worldbuilding",
  "ikarusv-cotautoclean": "interface-workflow",
  "leandrojofre-sillytavern-stat-us-maximus": "rpg-systems",
  "sillytavern-extension-groupgreetings": "character-worldbuilding",
  "spicymarinara-sillytavern-spotify-music-extension": "interface-workflow",
  "zapoverde-sillytavern-vistalyze": "character-worldbuilding",
  "aceeenvw-charswitchpro": "interface-workflow",
  "aeoness-swipe-sculpt": "interface-workflow",
  "brasen56-merged-world-tracker": "rpg-systems",
  "hornysilicon-charsaver": "character-worldbuilding",
  "kawaii-wolf-sillytavern-evenmoreflexiblecontinues": "generation-reasoning",
  "prolix-oc-lumiverse-chatroom": "interface-workflow",
  "prolix-oc-lumiverse-spotifycontrols": "interface-workflow",
  "selinawynters-ops-paramsentinel": "generation-reasoning",
  "sillytavern-extension-customsliders": "interface-workflow",
  "zompiexx-st-hands-free-voice": "interface-workflow",
} as const;

const manualCuratedRecords = {
  "evening-truth-carrd-prompt": {
    summary:
      "A collection of concise, model-tailored roleplay system prompts designed for broad Chat Completion compatibility.",
    primary_function: "preset",
    capabilities: [
      "prompt-engineering",
      "instruction-control",
      "character-worldbuilding",
    ],
    version: null,
    artifact_size_bytes: null,
  },
  "le-emotionalism-1-1-5-prompt": {
    summary:
      "A modular SillyTavern preset for grounded roleplay, autonomous NPCs, deliberate reasoning, continuity, pacing, and expressive prose.",
    primary_function: "preset",
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
    primary_function: "preset",
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
    primary_function: "preset",
    capabilities: ["prompt-engineering", "instruction-control"],
    version: "4 Max Mini",
    artifact_size_bytes: null,
  },
  "realistic-frankenstein-preset": {
    summary:
      "A three-tier SillyTavern preset family promoting character autonomy, realistic behavior, living-world continuity, and scalable prompting.",
    primary_function: "preset",
    capabilities: [
      "prompt-engineering",
      "instruction-control",
      "planning-reasoning",
    ],
    version: null,
    artifact_size_bytes: null,
  },
  "reddit-1v72pju": {
    summary:
      "A director-style roleplay preset where the user directs intent while an autonomous simulation authors the world, characters, and consequences.",
    primary_function: "preset",
    capabilities: [
      "prompt-engineering",
      "instruction-control",
      "planning-reasoning",
      "character-worldbuilding",
    ],
    version: null,
    artifact_size_bytes: null,
  },
  "writers-block-4": {
    summary:
      "A SillyTavern co-writing preset with director modes, adaptive pacing, structured reasoning, prose styles, character agency, and subtext.",
    primary_function: "preset",
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
    primary_function: "preset",
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

  expect(records.length).toBeGreaterThan(0);
  expect(ids.size).toBe(records.length);
  expect(Object.keys(countBy(records, (record) => record.kind)).sort()).toEqual(
    ["extension", "frontend", "preset"],
  );
  expect(
    Object.keys(countBy(records, (record) => record.source.type)).sort(),
  ).toEqual(expect.arrayContaining(["github", "github-organization", "url"]));
  expect(
    Object.keys(countBy(records, (record) => record.enrichment_policy)).sort(),
  ).toEqual(["automatic", "manual"]);
  const urlRecords = records.filter((record) => record.source.type === "url");
  const expectedUrlRecordIds = Object.keys(manualCuratedRecords)
    .filter((id) => id !== "tavern-rpg-suite")
    .sort();
  const curatedUrlRecords = urlRecords.filter((record) =>
    expectedUrlRecordIds.includes(record.id),
  );
  expect(curatedUrlRecords.map(({ id }) => id).sort()).toEqual(
    expectedUrlRecordIds,
  );
  expect(
    curatedUrlRecords.every(
      (record) => record.source.license_status === "missing",
    ),
  ).toBe(true);
  const pendingUrlRecords = urlRecords.filter(
    (record) => !expectedUrlRecordIds.includes(record.id),
  );
  expect(
    pendingUrlRecords.every(
      (record) =>
        (record.enrichment_policy === "automatic"
          ? ["curated", "provisional"].includes(record.metadata_status)
          : record.metadata_status === "provisional") &&
        record.source.license_status === "pending",
    ),
  ).toBe(true);

  for (const record of records) {
    expect(["extension", "frontend", "preset"], record.id).toContain(
      record.kind,
    );
    expect(supportedSourceTypes, record.id).toContain(record.source.type);
    expect(["automatic", "manual"], record.id).toContain(
      record.enrichment_policy,
    );
    if (record.source.type === "url") {
      expect(
        ["osi-approved", "proprietary", "missing", "pending"],
        record.id,
      ).toContain(record.source.license_status);
    }
    expect(["curated", "provisional"], record.id).toContain(
      record.metadata_status,
    );
    expect(
      classificationError(record.kind, record.primary_function),
      record.id,
    ).toBeNull();
    if (record.enrichment_policy === "automatic") {
      expect(record.enrichment_note, record.id).toBeUndefined();
    } else {
      expect(record.enrichment_note?.trim().length, record.id).toBeGreaterThan(
        0,
      );
    }
  }

  for (const record of provisionalRecords) {
    expect(
      classificationError(record.kind, record.primary_function),
      record.id,
    ).toBeNull();
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
    expect(
      classificationError(record?.kind ?? "", record?.primary_function ?? ""),
      record?.id,
    ).toBeNull();
    expect(record?.capabilities ?? []).not.toEqual([]);
    expect(record?.source.repository_id).toEqual(expect.any(Number));
  }

  for (const id of ["daddytorgo-hash-frankengarage", "zorgonatis-stabs-edh"]) {
    expect(records.find((record) => record.id === id)?.enrichment_policy).toBe(
      "automatic",
    );
  }

  expect(
    records.find((record) => record.id === "mentallyquill-st-wandlight")
      ?.model_families,
  ).toEqual(["model-agnostic", "claude", "gpt", "glm", "deepseek"]);

  expect(
    records.find((record) => record.id === "tavern-rpg-suite"),
  ).toMatchObject({
    enrichment_policy: "manual",
    enrichment_note: "Multi-repository suite; requires manual curation.",
  });
}

describe("full catalog data", () => {
  test("reconciles the exact approved 37-record classification ledger", async () => {
    const records = await loadRegistryRecords();
    const byId = new Map(records.map((record) => [record.id, record]));

    expect(Object.keys(reconciledPrimaryFunctions)).toHaveLength(37);
    for (const [id, primaryFunction] of Object.entries(
      reconciledPrimaryFunctions,
    )) {
      expect(byId.get(id)?.primary_function, id).toBe(primaryFunction);
    }
  });

  test("every project obeys the kind and primary-function contract", async () => {
    const records = await loadRegistryRecords();

    expect(
      records.flatMap((record) => {
        const error = classificationError(record.kind, record.primary_function);
        return error ? [`${record.id}: ${error}`] : [];
      }),
    ).toEqual([]);
  });

  test("has no canonical Uncategorized taxonomy state", async () => {
    const records = await loadRegistryRecords();

    expect(
      primaryFunctionVocabulary.primary_functions.map(({ id }) => id),
    ).not.toContain("uncategorized");
    expect(
      records.some((record) => record.primary_function === "uncategorized"),
    ).toBe(false);
  });

  test("matches the production catalog invariants", async () => {
    expectCatalogContract(await loadRegistryRecords());
  });

  test("accepts an owner-approved manual enrichment lock for a GitHub card", async () => {
    const records = structuredClone(await loadRegistryRecords());
    const ownerEdited = records.find(
      (record) => record.id === "mentallyquill-st-wandlight",
    );
    expect(ownerEdited).toBeDefined();

    ownerEdited!.enrichment_policy = "manual";
    ownerEdited!.enrichment_note =
      "Owner-authored catalog details approved through issue #144.";

    expectCatalogContract(records);
  });

  test("accepts Codeberg as a catalog source", async () => {
    const records = await loadRegistryRecords();
    const existingExtension = records.find(
      (record) =>
        record.kind === "extension" &&
        record.metadata_status === "curated" &&
        record.source.type === "github",
    );
    expect(existingExtension).toBeDefined();

    const codebergExtension = structuredClone(existingExtension!);
    codebergExtension.id = "codeberg-source-contract-fixture";
    codebergExtension.source.type = "codeberg";
    codebergExtension.source.repository_id = 1_699_613;

    expectCatalogContract([...records, codebergExtension]);
  });

  test("accepts a curated automatic URL record after enrichment", async () => {
    const records = await loadRegistryRecords();
    const automaticUrlRecord = records.find(
      (record) =>
        record.source.type === "url" &&
        record.enrichment_policy === "automatic" &&
        record.source.license_status === "pending",
    );
    expect(automaticUrlRecord).toBeDefined();

    const curatedAutomaticUrlRecord = structuredClone(automaticUrlRecord!);
    curatedAutomaticUrlRecord.id = "curated-automatic-url-contract-fixture";
    curatedAutomaticUrlRecord.metadata_status = "curated";
    curatedAutomaticUrlRecord.capabilities = ["prompt-engineering"];

    expectCatalogContract([...records, curatedAutomaticUrlRecord]);
  });

  test("accepts structural primary functions for provisional frontends", async () => {
    const records = await loadRegistryRecords();
    const existingFrontend = records.find(
      (record) => record.kind === "frontend",
    );
    expect(existingFrontend).toBeDefined();

    const provisionalFrontend = structuredClone(existingFrontend!);
    provisionalFrontend.id = "provisional-frontend-contract-fixture";
    provisionalFrontend.metadata_status = "provisional";
    provisionalFrontend.primary_function = "frontend";
    provisionalFrontend.capabilities = [];

    expectCatalogContract([...records, provisionalFrontend]);
  });

  test("rejects frontend primary functions for provisional non-frontends", async () => {
    const records = await loadRegistryRecords();
    const existingExtension = records.find(
      (record) => record.kind === "extension",
    );
    expect(existingExtension).toBeDefined();

    const provisionalExtension = structuredClone(existingExtension!);
    provisionalExtension.id = "provisional-extension-contract-fixture";
    provisionalExtension.metadata_status = "provisional";
    provisionalExtension.primary_function = "frontend";
    provisionalExtension.capabilities = [];

    expect(() =>
      expectCatalogContract([...records, provisionalExtension]),
    ).toThrow(/Extensions must use one approved Exte/iu);
  });

  test("applies the requested delist and automatic Reddit enrichment decisions", async () => {
    const records = await loadRegistryRecords();
    const byId = new Map(records.map((record) => [record.id, record]));

    for (const id of [
      "prolix-oc-lumiverse-chatroom",
      "prolix-oc-lumiverse-spotifycontrols",
    ]) {
      expect(byId.get(id), id).toMatchObject({
        visibility: "disabled",
        visibility_reason: "removed",
      });
    }

    expect(byId.get("reddit-1v64r6z")).toMatchObject({
      enrichment_policy: "automatic",
      source: {
        type: "url",
        url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update_writers_block_5_a_prose_and_narrative/",
      },
    });
    expect(byId.get("reddit-1v64r6z")).not.toHaveProperty("enrichment_note");

    const catalog = await buildCatalog({ write: false });
    expect(catalog.projects.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining([
        "prolix-oc-lumiverse-chatroom",
        "prolix-oc-lumiverse-spotifycontrols",
      ]),
    );
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
      record.primary_function =
        record.kind === "frontend"
          ? "frontend"
          : record.kind === "preset"
            ? "preset"
            : "developer-infrastructure";
      record.capabilities = ["automation"];
      record.summary =
        "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.";
    }

    expectCatalogContract(records);
  });

  test("builds every published production Kit", async () => {
    const kitDirectory = resolve(rootDirectory, "data/registry/kits");
    const kitRecords = await Promise.all(
      (await readdir(kitDirectory))
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map(async (file) =>
          JSON.parse(await readFile(resolve(kitDirectory, file), "utf8")),
        ),
    );
    const catalog = await buildCatalog({ write: false });

    expect(catalog.schemaVersion).toBe(3);
    expect(catalog.kits.map(({ id }) => id)).toEqual(
      kitRecords
        .filter(({ status }) => status === "published")
        .map(({ id }) => id)
        .sort(),
    );
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
        capabilities: ["automation"],
        classification_review: null,
      },
      { capabilities },
    );
    expect(result).toEqual({ valid: true });
  });
});
