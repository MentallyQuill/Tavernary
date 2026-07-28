import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import { loadOwnerProjectOptions } from "@/lib/help/load-owner-project-options";

const temporaryRoots: string[] = [];

async function fixtureRoot(records: object[], lineEnding = "\n") {
  const root = await mkdtemp(join(tmpdir(), "tavernary-owner-options-"));
  temporaryRoots.push(root);
  const directory = join(root, "data", "registry", "projects");
  await mkdir(directory, { recursive: true });
  await Promise.all(
    records.map((record, index) =>
      writeFile(
        join(directory, `${index}.json`),
        `${JSON.stringify(record, null, 2).replaceAll("\n", lineEnding)}${lineEnding}`,
      ),
    ),
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

const githubRecord = {
  schema_version: 5,
  id: "owner-alpha",
  name: "Alpha",
  kind: "extension",
  summary: "An owner-manageable project.",
  source: {
    type: "github",
    repository: "Owner/Alpha",
    repository_id: 42,
  },
  frontends: ["sillytavern"],
  primary_function: "interface-workflow",
  capabilities: ["automation"],
  metadata_status: "curated",
  visibility: "published",
  visibility_reason: null,
  refresh_policy: "automatic",
  enrichment_policy: "automatic",
};

test("loads deterministic owner options from canonical registry records", async () => {
  const root = await fixtureRoot([
    githubRecord,
    {
      ...githubRecord,
      id: "owner-preset",
      name: "Owner Preset",
      kind: "preset",
      source: {
        type: "github",
        repository: "Owner/Preset",
        repository_id: 84,
      },
      model_families: ["claude"],
      completion_formats: ["chat-completion"],
    },
  ]);

  await expect(loadOwnerProjectOptions(root)).resolves.toEqual([
    {
      id: "owner-alpha",
      name: "Alpha",
      kind: "extension",
      sourceType: "github",
      repository: "Owner/Alpha",
      repositoryId: 42,
      eligibleShape: true,
      ineligibilityReason: null,
      sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      listingState: {
        metadataStatus: "curated",
        visibility: "published",
        visibilityReason: null,
        refreshPolicy: "automatic",
        enrichmentPolicy: "automatic",
      },
      editable: {
        name: "Alpha",
        summary: "An owner-manageable project.",
        frontends: ["sillytavern"],
        primaryFunction: "interface-workflow",
        capabilities: ["automation"],
        modelFamilies: [],
        completionFormats: [],
      },
    },
    expect.objectContaining({
      id: "owner-preset",
      kind: "preset",
      editable: expect.objectContaining({
        modelFamilies: ["claude"],
        completionFormats: ["chat-completion"],
      }),
    }),
  ]);
});

test("marks unsupported source shapes with a human-readable fallback reason", async () => {
  const root = await fixtureRoot([
    {
      ...githubRecord,
      id: "missing-id",
      name: "Missing ID",
      source: {
        type: "github",
        repository: "Owner/Missing",
        repository_id: null,
      },
    },
    {
      ...githubRecord,
      id: "organization-suite",
      name: "Organization Suite",
      source: {
        type: "github-organization",
        organization: "example",
        url: "https://github.com/example",
      },
    },
    {
      ...githubRecord,
      id: "external-record",
      name: "External Record",
      source: { type: "url", url: "https://example.com/project" },
    },
  ]);

  const options = await loadOwnerProjectOptions(root);

  expect(options).toMatchObject([
    {
      id: "external-record",
      sourceType: "url",
      eligibleShape: false,
      ineligibilityReason:
        "External URL listings require a public project report.",
    },
    {
      id: "missing-id",
      sourceType: "github",
      eligibleShape: false,
      ineligibilityReason:
        "This GitHub listing does not have a verified immutable repository ID.",
    },
    {
      id: "organization-suite",
      sourceType: "github-organization",
      eligibleShape: false,
      ineligibilityReason:
        "Organization suite listings require a public project report.",
    },
  ]);
});

test("fingerprints parsed records independently of file line endings", async () => {
  const [lfRoot, crlfRoot] = await Promise.all([
    fixtureRoot([githubRecord], "\n"),
    fixtureRoot([githubRecord], "\r\n"),
  ]);

  const [lf, crlf] = await Promise.all([
    loadOwnerProjectOptions(lfRoot),
    loadOwnerProjectOptions(crlfRoot),
  ]);

  expect(lf[0]?.sourceFingerprint).toBe(crlf[0]?.sourceFingerprint);
});

test("does not offer disabled registry tombstones as current listings", async () => {
  const root = await fixtureRoot([
    githubRecord,
    {
      ...githubRecord,
      id: "removed-alpha",
      name: "Removed Alpha",
      visibility: "disabled",
    },
  ]);

  await expect(loadOwnerProjectOptions(root)).resolves.toMatchObject([
    { id: "owner-alpha" },
  ]);
});
