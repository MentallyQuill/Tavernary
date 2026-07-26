import { readFile } from "node:fs/promises";

import Ajv from "ajv";
import { expect, test } from "vitest";

const published = {
  schema_version: 5,
  id: "fixture",
  name: "Fixture",
  kind: "extension",
  summary: "Fixture.",
  metadata_status: "curated",
  source: {
    type: "github",
    repository: "example/fixture",
    repository_id: 1,
  },
  frontends: ["sillytavern"],
  primary_function: "generation-reasoning",
  capabilities: [],
  cataloged_at: "2026-07-24T00:00:00Z",
  catalog_cohort: "standard",
  visibility: "published",
  visibility_reason: null,
  refresh_policy: "automatic",
  enrichment_policy: "automatic",
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
      visibility: "quarantined",
      visibility_reason: "safety-review",
    }),
  ).toBe(true);
  expect(
    validate({
      ...published,
      visibility: "disabled",
      visibility_reason: null,
    }),
  ).toBe(false);
});
