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
  visibility?: string;
  source: {
    type: string;
    repository_id?: number | null;
    license_status?: string | null;
  };
}

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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

describe("full catalog data", () => {
  test("matches the launched 214-record contract", async () => {
    const records = await loadRegistryRecords();
    const ids = new Set(records.map((record) => record.id));
    const provisionalRecords = records.filter(
      (record) => record.metadata_status === "provisional",
    );

    expect(records).toHaveLength(214);
    expect(ids.size).toBe(214);
    expect(countBy(records, (record) => record.metadata_status)).toEqual({
      curated: 5,
      provisional: 209,
    });
    expect(countBy(records, (record) => record.kind)).toEqual({
      extension: 198,
      frontend: 4,
      preset: 12,
    });
    expect(countBy(records, (record) => record.source.type)).toEqual({
      github: 204,
      "github-organization": 1,
      url: 9,
    });
    expect(countBy(records, (record) => record.primary_function)).toEqual({
      uncategorized: 209,
      "generation-reasoning": 3,
      "interface-workflow": 1,
      frontend: 1,
    });
    expect(
      records.filter(
        (record) =>
          record.source.type === "url" &&
          record.source.license_status === "pending",
      ),
    ).toHaveLength(8);
    expect(
      records.filter(
        (record) =>
          record.source.type === "url" &&
          record.source.license_status === "missing",
      ),
    ).toHaveLength(1);

    for (const record of provisionalRecords) {
      expect(record.primary_function).toBe("uncategorized");
      expect(record.capabilities).toEqual([]);
    }

    for (const record of provisionalRecords.filter(
      (record) => record.source.type === "github",
    )) {
      expect(record.source.repository_id).toBeNull();
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
      expect(record.summary.length, record.id).toBeLessThanOrEqual(140);
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
          "A focused extension for automating repeatable project workflows across SillyTavern projects and creators.",
        metadata_status: "curated",
        primary_function: "developer-infrastructure",
        capabilities: ["automation"],
      },
      { primaryFunctions, capabilities },
    );
    expect(result).toEqual({ valid: true });
  });
});
