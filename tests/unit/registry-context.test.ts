import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

import {
  indexRegistry,
  loadRegistryContext,
  RegistryIntegrityError,
} from "../../scripts/catalog/registry-context.mjs";
import type { SourceRecord } from "@/features/catalog/source-record.mjs";

function source(id = "github-42", repositoryId = 42): SourceRecord {
  return {
    schema_version: 1,
    id,
    type: "github",
    repository: `owner/repo-${repositoryId}`,
    repository_id: repositoryId,
    status: "active",
    status_reason: null,
    refresh_policy: "automatic",
  };
}

test("joins sibling cards to one source and one snapshot", () => {
  const source = {
    schema_version: 1,
    id: "github-42",
    type: "github",
    repository: "owner/repo",
    repository_id: 42,
    status: "active",
    status_reason: null,
    refresh_policy: "automatic",
  } as const;
  const context = indexRegistry({
    projects: [
      { id: "card-a", source_id: source.id },
      { id: "card-b", source_id: source.id },
    ],
    sources: [source],
    snapshots: [{ source_id: source.id }],
  });

  expect(
    context.projectsBySourceId.get(source.id)?.map(({ id }) => id),
  ).toEqual(["card-a", "card-b"]);
  expect(context.snapshotsBySourceId.get(source.id)?.source_id).toBe(source.id);
});

const corruptionCases: Array<[string, Parameters<typeof indexRegistry>[0]]> = [
  [
    "duplicate-project-id",
    {
      projects: [
        { id: "card-a", source_id: "github-42" },
        { id: "card-a", source_id: "github-42" },
      ],
      sources: [source()],
      snapshots: [],
    },
  ],
  [
    "missing-project-source",
    {
      projects: [{ id: "card-a", source_id: "github-404" }],
      sources: [],
      snapshots: [],
    },
  ],
  [
    "duplicate-source-id",
    {
      projects: [],
      sources: [source(), source()],
      snapshots: [],
    },
  ],
  [
    "duplicate-repository-identity",
    {
      projects: [],
      sources: [source(), source("github-42-copy")],
      snapshots: [],
    },
  ],
  [
    "duplicate-source-snapshot",
    {
      projects: [],
      sources: [source()],
      snapshots: [{ source_id: "github-42" }, { source_id: "github-42" }],
    },
  ],
  [
    "missing-snapshot-source",
    {
      projects: [],
      sources: [],
      snapshots: [{ source_id: "github-404" }],
    },
  ],
];

test.each(corruptionCases)(
  "rejects registry corruption with %s",
  (code, input) => {
    expect(() => indexRegistry(input)).toThrowError(
      expect.objectContaining({
        name: RegistryIntegrityError.name,
        code,
      }),
    );
  },
);

test("loads and indexes the canonical registry directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-registry-"));
  try {
    const projectsPath = resolve(root, "data/registry/projects");
    const sourcesPath = resolve(root, "data/registry/sources");
    const snapshotsPath = resolve(root, "data/snapshots/github");
    await Promise.all([
      mkdir(projectsPath, { recursive: true }),
      mkdir(sourcesPath, { recursive: true }),
      mkdir(snapshotsPath, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        resolve(projectsPath, "card-a.json"),
        JSON.stringify({ id: "card-a", source_id: "github-42" }),
      ),
      writeFile(
        resolve(sourcesPath, "github-42.json"),
        JSON.stringify(source()),
      ),
      writeFile(
        resolve(snapshotsPath, "github-42.json"),
        JSON.stringify({ source_id: "github-42" }),
      ),
    ]);

    const context = await loadRegistryContext(root);

    expect(context.projectsById.get("card-a")?.source_id).toBe("github-42");
    expect(context.sourcesById.get("github-42")).toMatchObject({
      repository_id: 42,
    });
    expect(context.snapshotsBySourceId.get("github-42")?.source_id).toBe(
      "github-42",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
