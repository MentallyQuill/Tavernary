import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { writeEnrichedRecord } from "../../scripts/catalog/enrich-readmes.mjs";
import type { EnrichmentOutput } from "../../scripts/catalog/enrichment-contract.mjs";

const vocabularies = {
  schema_version: 1 as const,
  tags: [
    {
      id: "automate-roleplay-workflows",
      label: "Automate roleplay workflows",
      facet: "goal" as const,
      description: "Automates repeated roleplay setup or execution.",
      aliases: ["automation"],
      applicable_kinds: ["extension" as const],
      inclusion_guidance: ["The source describes repeatable automation."],
      exclusion_guidance: [],
    },
  ],
};

const record = {
  schema_version: 6,
  id: "fixture",
  name: "Fixture",
  kind: "extension",
  summary: "Generic intake details.",
  tags: [],
  metadata_status: "provisional",
  source_id: "github-1",
  frontends: ["sillytavern"],
  primary_function: "interface-workflow",
  cataloged_at: "2026-07-24T00:00:00.000Z",
  catalog_cohort: "seed",
  listing_status: "active",
  metadata_policy: {
    summary: { mode: "automatic" as const },
    tags: { mode: "automatic" as const },
  },
};

const output = {
  summary: {
    value:
      "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
    evidence: ["readme:1-4"],
  },
  tags: [
    {
      id: "automate-roleplay-workflows",
      evidence: ["readme:5-8"],
    },
  ],
  result: "accepted-unchanged",
  change_reasons: [],
  policy_signal: "none",
} satisfies EnrichmentOutput;

test("atomically merges only canonical generated metadata fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-enrichment-"));
  const path = join(root, "fixture.json");
  await writeFile(path, JSON.stringify(record, null, 2));

  await writeEnrichedRecord(
    path,
    { ...record, source_id: "github-99" },
    output,
    vocabularies,
  );

  const serialized = await readFile(path, "utf8");
  const written = JSON.parse(serialized);
  expect(written).toEqual({
    ...record,
    summary: output.summary.value,
    tags: ["automate-roleplay-workflows"],
    metadata_status: "curated",
  });
  expect(written.primary_function).toBe("interface-workflow");
  expect(written.source_id).toEqual(record.source_id);
  expect(written).not.toHaveProperty("evidence");
  expect(written).not.toHaveProperty("result");
});

test("refuses invalid output without changing the record", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-enrichment-"));
  const path = join(root, "fixture.json");
  const original = JSON.stringify(record, null, 2);
  await writeFile(path, original);

  await expect(
    writeEnrichedRecord(
      path,
      record,
      {
        ...output,
        tags: [{ id: "invented", evidence: ["readme:1"] }],
      },
      vocabularies,
    ),
  ).rejects.toThrow("unknown ID");
  expect(await readFile(path, "utf8")).toBe(original);
});

test("re-reads and refuses a record with no automatic fields after selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-enrichment-"));
  const path = join(root, "fixture.json");
  const manual = {
    ...record,
    metadata_policy: {
      summary: {
        mode: "manual" as const,
        note: "Verified repository owner selection.",
      },
      tags: {
        mode: "manual" as const,
        note: "Verified repository owner selection.",
      },
    },
  };
  const original = JSON.stringify(manual, null, 2);
  await writeFile(path, original);

  await expect(
    writeEnrichedRecord(path, record, output, vocabularies),
  ).rejects.toMatchObject({
    code: "manual-enrichment-policy",
    enrichmentNote: "Summary and tags are manually managed.",
  });
  expect(await readFile(path, "utf8")).toBe(original);
});

test("preserves every non-generated field across concurrent record writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-enrichment-"));
  const records = ["alpha", "beta"].map((id, index) => ({
    ...record,
    id,
    name: id,
    source_id: `github-${index + 1}`,
  }));
  const paths = records.map(({ id }) => join(root, `${id}.json`));
  await Promise.all(
    records.map((candidate, index) =>
      writeFile(paths[index], JSON.stringify(candidate, null, 2)),
    ),
  );

  await Promise.all(
    records.map((candidate, index) =>
      writeEnrichedRecord(paths[index], candidate, output, vocabularies),
    ),
  );

  const written = await Promise.all(
    paths.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );
  const generated = new Set(["summary", "tags", "metadata_status"]);
  const stableFields = (candidate: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(candidate).filter(([key]) => !generated.has(key)),
    );

  expect(written.map(stableFields)).toEqual(records.map(stableFields));
});
