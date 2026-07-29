import { readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { writeEnrichedRecord } from "../../scripts/catalog/enrich-readmes.mjs";
import type { EnrichmentOutput } from "../../scripts/catalog/enrichment-contract.mjs";

const record = {
  schema_version: 5,
  id: "fixture",
  name: "Fixture",
  kind: "extension",
  summary: "Generic intake details.",
  metadata_status: "provisional",
  source: { type: "github", repository: "Creator/Project", repository_id: 1 },
  frontends: ["sillytavern"],
  primary_function: "interface-workflow",
  capabilities: [],
  cataloged_at: "2026-07-24T00:00:00.000Z",
  catalog_cohort: "seed",
  visibility: "published",
  refresh_policy: "automatic",
  enrichment_policy: "automatic" as const,
};

const output = {
  summary:
    "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
  metadata_status: "curated",
  capabilities: ["automation"],
  classification_review: {
    status: "possible-mismatch",
    suggested_primary_function: "developer-infrastructure",
    explanation: "The source emphasizes developer-facing automation.",
  },
  result: "accepted-unchanged",
  change_reasons: [],
  policy_signal: "none",
} satisfies EnrichmentOutput;

test("atomically merges only editorial enrichment fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-enrichment-"));
  const path = join(root, "fixture.json");
  await writeFile(path, JSON.stringify(record, null, 2));

  await writeEnrichedRecord(
    path,
    { ...record, source: { ...record.source, repository: "Other/Repo" } },
    output,
  );

  const serialized = await readFile(path, "utf8");
  const written = JSON.parse(serialized);
  expect(written).toEqual({
    ...record,
    summary: output.summary,
    metadata_status: output.metadata_status,
    capabilities: output.capabilities,
  });
  expect(written.primary_function).toBe("interface-workflow");
  expect(written).not.toHaveProperty("classification_review");
  expect(written.source).toEqual(record.source);
  expect(serialized).toContain('"frontends": ["sillytavern"]');
  expect(serialized).toContain('"capabilities": ["automation"]');
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

test("re-reads and refuses a record changed to manual after selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-enrichment-"));
  const path = join(root, "fixture.json");
  const manual = {
    ...record,
    enrichment_policy: "manual",
    enrichment_note: "Maintainer locked this record.",
  };
  const original = JSON.stringify(manual, null, 2);
  await writeFile(path, original);

  await expect(writeEnrichedRecord(path, record, output)).rejects.toMatchObject(
    {
      code: "manual-enrichment-policy",
      enrichmentNote: "Maintainer locked this record.",
    },
  );
  expect(await readFile(path, "utf8")).toBe(original);
});

test("preserves every non-editorial field across concurrent record writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-enrichment-"));
  const records = ["alpha", "beta"].map((id, index) => ({
    ...record,
    id,
    name: id,
    source: {
      ...record.source,
      repository: `Creator/${id}`,
      repository_id: index + 1,
    },
  }));
  const paths = records.map(({ id }) => join(root, `${id}.json`));
  await Promise.all(
    records.map((candidate, index) =>
      writeFile(paths[index], JSON.stringify(candidate, null, 2)),
    ),
  );

  await Promise.all(
    records.map((candidate, index) =>
      writeEnrichedRecord(paths[index], candidate, output),
    ),
  );

  const written = await Promise.all(
    paths.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );
  const editorial = new Set(["summary", "metadata_status", "capabilities"]);
  const nonEditorial = (candidate: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(candidate).filter(([key]) => !editorial.has(key)),
    );

  expect(written.map(nonEditorial)).toEqual(records.map(nonEditorial));
});
