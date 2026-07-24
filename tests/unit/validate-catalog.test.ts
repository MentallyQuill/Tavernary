import { describe, expect, test } from "vitest";

import { validateCatalog } from "../../scripts/catalog/validate.mjs";

const validRecord = {
  schema_version: 1,
  id: "valid-preset",
  name: "Valid Preset",
  kind: "preset",
  summary: "A valid test fixture.",
  source: {
    type: "github",
    repository: "example/valid-preset",
    repository_id: 1,
  },
  frontends: ["sillytavern"],
  primary_function: "generation-reasoning",
  capabilities: ["prompt-engineering"],
  cataloged_at: "2026-07-23T00:00:00Z",
  catalog_cohort: "seed",
  visibility: "published",
  refresh_policy: "automatic",
};

describe("catalog validation", () => {
  test("accepts the five production records", async () => {
    const result = await validateCatalog();
    expect(result.errors).toEqual([]);
    expect(result.projectCount).toBe(5);
  });

  test("rejects a non-GitHub extension", async () => {
    const result = await validateCatalog({
      records: [
        {
          schema_version: 1,
          id: "bad-extension",
          name: "Bad Extension",
          kind: "extension",
          summary: "Invalid source fixture.",
          source: { type: "url", url: "https://example.com/tool" },
          frontends: ["sillytavern"],
          primary_function: "generation-reasoning",
          capabilities: [],
          cataloged_at: "2026-07-23T00:00:00Z",
          catalog_cohort: "seed",
          visibility: "published",
          refresh_policy: "automatic",
        },
      ],
    });

    expect(result.errors).toContain(
      "bad-extension: extension requires source.type github",
    );
  });

  test("rejects duplicate identities and canonical sources", async () => {
    const result = await validateCatalog({
      records: [
        validRecord,
        {
          ...validRecord,
          source: {
            ...validRecord.source,
            repository: "EXAMPLE/VALID-PRESET",
          },
        },
      ],
    });

    expect(result.errors).toContain("valid-preset: duplicate project id");
    expect(result.errors).toContain("valid-preset: duplicate canonical source");
  });

  test("rejects unknown vocabulary values and missing GitHub identity", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "bad-vocabulary",
          source: {
            type: "github",
            repository: "example/bad-vocabulary",
            repository_id: 0,
          },
          frontends: ["unknown-frontend"],
          primary_function: "unknown-function",
          capabilities: ["unknown-capability"],
        },
      ],
    });

    expect(result.errors).toContain(
      "bad-vocabulary: GitHub source requires permanent repository_id",
    );
    expect(result.errors).toContain(
      "bad-vocabulary: unknown frontend unknown-frontend",
    );
    expect(result.errors).toContain(
      "bad-vocabulary: unknown primary function unknown-function",
    );
    expect(result.errors).toContain(
      "bad-vocabulary: unknown capability unknown-capability",
    );
  });

  test("allows URL sources only for presets and only over https", async () => {
    const result = await validateCatalog({
      records: [
        {
          ...validRecord,
          id: "unsafe-url",
          source: {
            type: "url",
            url: "http://example.com/preset",
            published_at: null,
            version: null,
            artifact_size_bytes: null,
            license_status: "missing",
            license_spdx_id: null,
          },
        },
      ],
    });

    expect(result.errors).toContain(
      "unsafe-url: URL source requires https protocol",
    );
  });
});
