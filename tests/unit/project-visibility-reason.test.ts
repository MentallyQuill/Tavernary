import { readFile } from "node:fs/promises";

import Ajv from "ajv";
import { expect, test } from "vitest";

const published = {
  schema_version: 6,
  id: "fixture",
  source_id: "github-1",
  name: "Fixture",
  kind: "extension",
  summary: "Fixture.",
  metadata_status: "curated",
  frontends: ["sillytavern"],
  primary_function: "generation-reasoning",
  tags: [],
  cataloged_at: "2026-07-24T00:00:00Z",
  catalog_cohort: "standard",
  listing_status: "active",
  listing_status_reason: null,
  metadata_policy: {
    summary: { mode: "automatic" },
    tags: { mode: "automatic" },
  },
};

test("requires a controlled reason for non-published projects", async () => {
  const schema = JSON.parse(
    await readFile("data/schemas/project.schema.json", "utf8"),
  );
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

  expect(validate(published)).toBe(true);
  expect(
    validate({
      ...published,
      listing_status: "quarantined",
      listing_status_reason: "safety-review",
    }),
  ).toBe(true);
  expect(
    validate({
      ...published,
      listing_status: "retired",
      listing_status_reason: null,
    }),
  ).toBe(false);
});
