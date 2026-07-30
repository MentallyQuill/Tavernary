import { readFile } from "node:fs/promises";

import Ajv from "ajv";
import { beforeAll, expect, test } from "vitest";

let validate: ReturnType<Ajv["compile"]>;

const activeCard = {
  schema_version: 6,
  id: "fixture-card",
  source_id: "github-42",
  name: "Fixture Card",
  kind: "extension",
  summary: "A source-backed schema-v6 fixture.",
  metadata_status: "curated",
  frontends: ["sillytavern"],
  primary_function: "interface-workflow",
  tags: ["local-first"],
  cataloged_at: "2026-07-29T00:00:00Z",
  catalog_cohort: "standard",
  listing_status: "active",
  listing_status_reason: null,
  metadata_policy: {
    summary: { mode: "automatic" },
    tags: {
      mode: "manual",
      note: "Verified repository owner selection.",
    },
  },
};

beforeAll(async () => {
  const schema = JSON.parse(
    await readFile("data/schemas/project.schema.json", "utf8"),
  );
  validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
});

test("accepts the canonical source-backed card shape", () => {
  expect(validate(activeCard), JSON.stringify(validate.errors)).toBe(true);
});

test("rejects every removed schema-v5 field", () => {
  for (const [property, value] of Object.entries({
    source: {
      type: "github",
      repository: "owner/repository",
      repository_id: 42,
    },
    capabilities: [],
    visibility: "published",
    visibility_reason: null,
    refresh_policy: "automatic",
    enrichment_policy: "automatic",
    enrichment_note: "Legacy policy note.",
  })) {
    expect(
      validate({ ...activeCard, [property]: value }),
      `${property} unexpectedly remained valid`,
    ).toBe(false);
  }
});

test("enforces six unique tags and preset-only model metadata", () => {
  expect(
    validate({
      ...activeCard,
      tags: ["one", "two", "three", "four", "five", "six", "seven"],
    }),
  ).toBe(false);
  expect(
    validate({ ...activeCard, tags: ["local-first", "local-first"] }),
  ).toBe(false);
  expect(
    validate({
      ...activeCard,
      model_families: ["claude"],
      completion_formats: ["chat-completion"],
    }),
  ).toBe(false);
  expect(
    validate({
      ...activeCard,
      id: "fixture-preset",
      kind: "preset",
      primary_function: "preset",
      model_families: ["claude"],
      completion_formats: ["chat-completion"],
    }),
    JSON.stringify(validate.errors),
  ).toBe(true);
});

test("requires controlled card lifecycle and metadata policy states", () => {
  expect(
    validate({
      ...activeCard,
      listing_status: "retired",
      listing_status_reason: "owner-request",
    }),
  ).toBe(true);
  expect(
    validate({
      ...activeCard,
      listing_status: "retired",
      listing_status_reason: null,
    }),
  ).toBe(false);
  expect(
    validate({
      ...activeCard,
      metadata_policy: {
        ...activeCard.metadata_policy,
        tags: { mode: "manual" },
      },
    }),
  ).toBe(false);
});
