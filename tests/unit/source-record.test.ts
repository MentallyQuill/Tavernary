import { readFile } from "node:fs/promises";

import Ajv from "ajv";
import { expect, test } from "vitest";

import {
  canonicalSourceUrl,
  legacySourceId,
  repositorySourceId,
  siblingProjectId,
} from "@/features/catalog/source-record.mjs";
import type { LegacyProjectRecord } from "@/features/catalog/source-record.mjs";

test("uses immutable repository identity and a readable sibling slug", () => {
  const source = {
    id: "github-1189674883",
    type: "github" as const,
    repository: "Arif-salah/Megumin-Suite",
    repository_id: 1189674883,
  };

  expect(repositorySourceId("github", 1189674883)).toBe("github-1189674883");
  expect(siblingProjectId(source, "V9 Mirage")).toBe(
    "arif-salah-megumin-suite-v9-mirage",
  );
});

const legacyCases: Array<[LegacyProjectRecord, string, string]> = [
  [
    {
      id: "legacy-github",
      source: {
        type: "github",
        repository: "owner/repo",
        repository_id: 42,
      },
    },
    "github-42",
    "https://github.com/owner/repo",
  ],
  [
    {
      id: "legacy-codeberg",
      source: {
        type: "codeberg",
        repository: "owner/repo",
        repository_id: 84,
      },
    },
    "codeberg-84",
    "https://codeberg.org/owner/repo",
  ],
  [
    {
      id: "organization-card",
      source: {
        type: "github-organization",
        organization: "example",
        url: "https://github.com/example",
      },
    },
    "github-organization-organization-card",
    "https://github.com/example",
  ],
  [
    {
      id: "url-card",
      source: {
        type: "url",
        url: "https://example.com/preset",
      },
    },
    "url-url-card",
    "https://example.com/preset",
  ],
];

test.each(legacyCases)(
  "derives a stable source ID and canonical URL for a legacy card",
  (project, expectedId, expectedUrl) => {
    const sourceId = legacySourceId(project);
    const source = { id: sourceId, ...project.source };

    expect(sourceId).toBe(expectedId);
    expect(canonicalSourceUrl(source)).toBe(expectedUrl);
  },
);

test("rejects an unsupported repository provider", () => {
  expect(() => repositorySourceId("gitlab" as "github", 42)).toThrow(
    /Unsupported repository provider/u,
  );
});

test.each([
  ["github" as const, 0],
  ["codeberg" as const, Number.NaN],
])("rejects an invalid %s repository ID", (provider, id) => {
  expect(() => repositorySourceId(provider, id)).toThrow(
    /positive repository ID/u,
  );
});

test("validates active and permanently delisted source records", async () => {
  const schema = JSON.parse(
    await readFile("data/schemas/source.schema.json", "utf8"),
  );
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  const active = {
    schema_version: 1,
    id: "github-1189674883",
    type: "github",
    repository: "Arif-salah/Megumin-Suite",
    repository_id: 1189674883,
    status: "active",
    status_reason: null,
    refresh_policy: "automatic",
  };

  expect(validate(active)).toBe(true);
  expect(
    validate({
      ...active,
      status: "delisted",
      status_reason: "removed",
      refresh_policy: "paused",
    }),
  ).toBe(true);
  expect(
    validate({
      ...active,
      status: "delisted",
      status_reason: null,
      refresh_policy: "automatic",
    }),
  ).toBe(false);
});
