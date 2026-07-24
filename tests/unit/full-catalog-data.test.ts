import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function loadRegistryRecords() {
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

function countBy(records, selector) {
  const counts = new Map();
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
});
