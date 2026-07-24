import { readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { writeEnrichedRecord } from "../../scripts/catalog/enrich-readmes.mjs";

const record = {
  schema_version: 2,
  id: "fixture",
  name: "Fixture",
  kind: "extension",
  summary: "Generic intake details.",
  metadata_status: "provisional",
  source: { type: "github", repository: "Creator/Project", repository_id: 1 },
  frontends: ["sillytavern"],
  primary_function: "uncategorized",
  capabilities: [],
  cataloged_at: "2026-07-24T00:00:00.000Z",
  catalog_cohort: "seed",
  visibility: "published",
  refresh_policy: "automatic",
};

const output = {
  summary:
    "A focused extension for automating repeatable project workflows across SillyTavern projects and creators.",
  metadata_status: "curated",
  primary_function: "developer-infrastructure",
  capabilities: ["automation"],
} as const;

test("atomically merges only editorial enrichment fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-enrichment-"));
  const path = join(root, "fixture.json");
  await writeFile(path, JSON.stringify(record, null, 2));

  await writeEnrichedRecord(
    path,
    { ...record, source: { ...record.source, repository: "Other/Repo" } },
    output,
  );

  const written = JSON.parse(await readFile(path, "utf8"));
  expect(written).toEqual({ ...record, ...output });
  expect(written.source).toEqual(record.source);
});

test("refuses invalid output without changing the record", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-enrichment-"));
  const path = join(root, "fixture.json");
  const original = JSON.stringify(record, null, 2);
  await writeFile(path, original);

  await expect(
    writeEnrichedRecord(path, record, {
      ...output,
      metadata_status: "provisional",
    } as never),
  ).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe(original);
});
