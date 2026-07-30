import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import { loadOwnerProjectOptions } from "@/lib/help/load-owner-project-options";

const temporaryRoots: string[] = [];

async function fixtureRoot(
  projects: object[],
  sources: object[],
  lineEnding = "\n",
) {
  const root = await mkdtemp(join(tmpdir(), "tavernary-owner-options-"));
  temporaryRoots.push(root);
  const projectDirectory = join(root, "data", "registry", "projects");
  const sourceDirectory = join(root, "data", "registry", "sources");
  await Promise.all([
    mkdir(projectDirectory, { recursive: true }),
    mkdir(sourceDirectory, { recursive: true }),
  ]);
  await Promise.all([
    ...projects.map((record, index) =>
      writeFile(
        join(projectDirectory, `${index}.json`),
        `${JSON.stringify(record, null, 2).replaceAll("\n", lineEnding)}${lineEnding}`,
      ),
    ),
    ...sources.map((record, index) =>
      writeFile(
        join(sourceDirectory, `${index}.json`),
        `${JSON.stringify(record, null, 2).replaceAll("\n", lineEnding)}${lineEnding}`,
      ),
    ),
  ]);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

const githubSource = {
  schema_version: 1,
  id: "github-42",
  type: "github",
  repository: "Owner/Alpha",
  repository_id: 42,
  status: "active",
  status_reason: null,
  refresh_policy: "automatic",
};

const githubProject = {
  schema_version: 6,
  id: "owner-alpha",
  name: "Alpha",
  kind: "extension",
  summary: "An owner-manageable project.",
  metadata_status: "curated",
  source_id: "github-42",
  frontends: ["sillytavern"],
  primary_function: "interface-workflow",
  tags: ["automate-workflows"],
  metadata_policy: {
    summary: { mode: "automatic" },
    tags: { mode: "manual", note: "Owner-authored tags accepted in #12." },
  },
  listing_status: "active",
  listing_status_reason: null,
};

test("joins cards to sources with separate fingerprints and sibling state", async () => {
  const root = await fixtureRoot(
    [
      githubProject,
      {
        ...githubProject,
        id: "owner-alpha-preset",
        name: "Alpha Preset",
        kind: "preset",
        primary_function: "preset",
        tags: ["creative-writing"],
        model_families: ["claude"],
        completion_formats: ["chat-completion"],
        listing_status: "retired",
        listing_status_reason: "owner-request",
      },
    ],
    [githubSource],
  );

  await expect(loadOwnerProjectOptions(root)).resolves.toMatchObject([
    {
      id: "owner-alpha",
      sourceId: "github-42",
      repository: "Owner/Alpha",
      repositoryId: 42,
      eligibleShape: true,
      projectFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      siblings: [
        {
          id: "owner-alpha-preset",
          name: "Alpha Preset",
          listingStatus: "retired",
        },
      ],
      sourceState: { status: "active", refreshPolicy: "automatic" },
      listingState: {
        metadataStatus: "curated",
        listingStatus: "active",
        listingStatusReason: null,
      },
      editable: {
        name: "Alpha",
        tags: ["automate-workflows"],
        metadataPolicy: {
          summary: { mode: "automatic" },
          tags: { mode: "manual" },
        },
      },
    },
    {
      id: "owner-alpha-preset",
      siblings: [{ id: "owner-alpha", name: "Alpha", listingStatus: "active" }],
      editable: {
        modelFamilies: ["claude"],
        completionFormats: ["chat-completion"],
      },
    },
  ]);
});

test("marks non-GitHub and delisted sources ineligible for owner operations", async () => {
  const codeberg = {
    ...githubSource,
    id: "codeberg-52",
    type: "codeberg",
    repository_id: 52,
  };
  const delisted = {
    ...githubSource,
    id: "github-84",
    repository: "Owner/Removed",
    repository_id: 84,
    status: "delisted",
    status_reason: "removed",
    refresh_policy: "paused",
  };
  const root = await fixtureRoot(
    [
      { ...githubProject, id: "codeberg-card", source_id: "codeberg-52" },
      { ...githubProject, id: "removed-card", source_id: "github-84" },
    ],
    [codeberg, delisted],
  );

  await expect(loadOwnerProjectOptions(root)).resolves.toMatchObject([
    {
      id: "codeberg-card",
      sourceType: "codeberg",
      eligibleShape: false,
      ineligibilityReason:
        "Only GitHub repository listings can use owner maintenance.",
    },
    {
      id: "removed-card",
      eligibleShape: false,
      ineligibilityReason: "This repository source is permanently delisted.",
      sourceState: { status: "delisted", refreshPolicy: "paused" },
    },
  ]);
});

test("fingerprints parsed project and source records independently of line endings", async () => {
  const [lfRoot, crlfRoot] = await Promise.all([
    fixtureRoot([githubProject], [githubSource], "\n"),
    fixtureRoot([githubProject], [githubSource], "\r\n"),
  ]);
  const [lf, crlf] = await Promise.all([
    loadOwnerProjectOptions(lfRoot),
    loadOwnerProjectOptions(crlfRoot),
  ]);

  expect(lf[0]?.projectFingerprint).toBe(crlf[0]?.projectFingerprint);
  expect(lf[0]?.sourceFingerprint).toBe(crlf[0]?.sourceFingerprint);
});

test("includes retired and quarantined cards for management", async () => {
  const root = await fixtureRoot(
    [
      { ...githubProject, listing_status: "retired" },
      {
        ...githubProject,
        id: "owner-alpha-review",
        listing_status: "quarantined",
        listing_status_reason: "safety-review",
      },
    ],
    [githubSource],
  );

  await expect(loadOwnerProjectOptions(root)).resolves.toMatchObject([
    { id: "owner-alpha", listingState: { listingStatus: "retired" } },
    {
      id: "owner-alpha-review",
      listingState: { listingStatus: "quarantined" },
    },
  ]);
});

test("fails closed when a card references a missing source", async () => {
  const root = await fixtureRoot([githubProject], []);
  await expect(loadOwnerProjectOptions(root)).rejects.toThrow(
    "owner-alpha: source github-42 does not exist",
  );
});
