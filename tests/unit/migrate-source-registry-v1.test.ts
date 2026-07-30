import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename as fsRename,
  rm,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

import {
  planSourceRegistryMigration,
  SourceMigrationConflictError,
  writeSourceRegistryMigration,
} from "../../scripts/catalog/migrate-source-registry-v1.mjs";
import type {
  LegacyProject,
  LegacyRepositorySnapshot,
  SourceMigrationPlan,
} from "../../scripts/catalog/migrate-source-registry-v1.mjs";

function project(
  id: string,
  repositoryId: number,
  visibility: "published" | "disabled",
): LegacyProject {
  return {
    schema_version: 5,
    id,
    name: id === "active-card" ? "Active Card" : "Removed Card",
    kind: "extension",
    summary: "Fixture summary.",
    metadata_status: "curated",
    source: {
      type: "github",
      repository: `owner/${id}`,
      repository_id: repositoryId,
    },
    frontends: ["sillytavern"],
    primary_function: "interface-workflow",
    capabilities: ["memory-management"],
    cataloged_at: "2026-07-29T00:00:00Z",
    catalog_cohort: "standard",
    visibility,
    visibility_reason: visibility === "disabled" ? "removed" : null,
    refresh_policy: "automatic",
    enrichment_policy: "automatic",
  };
}

function snapshot(
  projectId: string,
  repositoryId: number,
): LegacyRepositorySnapshot {
  return {
    schema_version: 3,
    provider: "github",
    project_id: projectId,
    repository: {
      id: repositoryId,
      owner: "owner",
      name: projectId,
      url: `https://github.com/owner/${projectId}`,
    },
    source_health: "healthy",
  };
}

const automaticMetadata = {
  tags: [],
  metadata_policy: {
    summary: { mode: "automatic" as const },
    tags: { mode: "automatic" as const },
  },
};

test("plans the combined source, card, snapshot, and refresh migration", () => {
  const projects = [
    project("active-card", 42, "published"),
    project("removed-card", 84, "disabled"),
  ];
  const plan = planSourceRegistryMigration({
    projects,
    snapshots: [snapshot("active-card", 42), snapshot("removed-card", 84)],
    refreshManifest: {
      schema_version: 2,
      mode: "incremental",
      project_timings: [
        { project_id: "active-card", outcome: "unchanged" },
        { project_id: "removed-card", outcome: "unchanged" },
      ],
    },
    metadataByProjectId: {
      "active-card": {
        tags: ["memory-management"],
        metadata_policy: {
          summary: { mode: "automatic" },
          tags: { mode: "manual", note: "Maintainer-approved tags." },
        },
      },
      "removed-card": {
        tags: [],
        metadata_policy: {
          summary: { mode: "automatic" },
          tags: { mode: "automatic" },
        },
      },
    },
  });

  expect(plan.counts).toEqual({
    projects: 2,
    sources: 2,
    snapshots: 2,
    delistedSources: 1,
  });
  expect(plan.projects[0]).toMatchObject({
    schema_version: 6,
    id: "active-card",
    source_id: "github-42",
    listing_status: "active",
    listing_status_reason: null,
    tags: ["memory-management"],
  });
  expect(plan.projects[0]).not.toHaveProperty("source");
  expect(plan.projects[0]).not.toHaveProperty("refresh_policy");
  expect(plan.projects[0]).not.toHaveProperty("capabilities");
  expect(plan.projects[0]).not.toHaveProperty("enrichment_policy");
  expect(plan.sources[1]).toMatchObject({
    id: "github-84",
    status: "delisted",
    status_reason: "removed",
    refresh_policy: "paused",
  });
  expect(plan.snapshots[0]).toMatchObject({
    schema_version: 4,
    source_id: "github-42",
  });
  expect(plan.snapshots[0]).not.toHaveProperty("project_id");
  expect(plan.refreshManifest).toMatchObject({
    schema_version: 3,
    source_timings: [{ source_id: "github-42" }, { source_id: "github-84" }],
  });
  expect(plan.refreshManifest).not.toHaveProperty("project_timings");
});

test("reports every card claiming contradictory facts for one source", () => {
  const first = project("card-a", 42, "published");
  const second = {
    ...project("card-b", 42, "published"),
    source: {
      type: "github" as const,
      repository: "other-owner/renamed-repo",
      repository_id: 42,
    },
  };
  expect(() =>
    planSourceRegistryMigration({
      projects: [first, second],
      snapshots: [],
      refreshManifest: { schema_version: 2, project_timings: [] },
      metadataByProjectId: {
        "card-a": automaticMetadata,
        "card-b": automaticMetadata,
      },
    }),
  ).toThrowError(
    expect.objectContaining({
      name: SourceMigrationConflictError.name,
      code: "conflicting-source-identity",
      sourceId: "github-42",
      projectIds: ["card-a", "card-b"],
    }),
  );
});

test("migrates one extension and two distinct Presets onto one shared source", () => {
  const sharedSource = {
    type: "github" as const,
    repository: "owner/megumin-like-suite",
    repository_id: 42,
  };
  const extension = {
    ...project("suite-extension", 42, "published"),
    name: "Suite Extension",
    source: structuredClone(sharedSource),
  };
  const roleplayPreset = {
    ...project("suite-roleplay-preset", 42, "published"),
    name: "Suite Roleplay Preset",
    kind: "preset" as const,
    primary_function: "preset",
    source: structuredClone(sharedSource),
    model_families: ["claude"],
    completion_formats: ["chat-completion"],
  };
  const reasoningPreset = {
    ...project("suite-reasoning-preset", 42, "published"),
    name: "Suite Reasoning Preset",
    kind: "preset" as const,
    primary_function: "preset",
    source: structuredClone(sharedSource),
    model_families: ["deepseek"],
    completion_formats: ["text-completion"],
  };

  const plan = planSourceRegistryMigration({
    projects: [extension, roleplayPreset, reasoningPreset],
    snapshots: [snapshot(extension.id, 42)],
    refreshManifest: {
      schema_version: 2,
      project_timings: [{ project_id: extension.id, outcome: "unchanged" }],
    },
    metadataByProjectId: new Map([
      [
        extension.id,
        {
          tags: ["extend-sillytavern"],
          metadata_policy: {
            summary: { mode: "automatic" },
            tags: { mode: "automatic" },
          },
        },
      ],
      [
        roleplayPreset.id,
        {
          tags: ["support-roleplay"],
          metadata_policy: {
            summary: {
              mode: "manual",
              note: "Trusted Tavernary editor selection.",
            },
            tags: { mode: "automatic" },
          },
        },
      ],
      [
        reasoningPreset.id,
        {
          tags: ["guide-reasoning"],
          metadata_policy: {
            summary: { mode: "automatic" },
            tags: {
              mode: "manual",
              note: "Verified repository owner selection.",
            },
          },
        },
      ],
    ]),
  });

  expect(plan.counts).toEqual({
    projects: 3,
    sources: 1,
    snapshots: 1,
    delistedSources: 0,
  });
  expect(plan.sources).toEqual([
    expect.objectContaining({
      id: "github-42",
      repository: "owner/megumin-like-suite",
    }),
  ]);
  expect(plan.snapshots).toEqual([
    expect.objectContaining({ source_id: "github-42" }),
  ]);
  expect(plan.projects).toEqual([
    expect.objectContaining({
      id: extension.id,
      source_id: "github-42",
      tags: ["extend-sillytavern"],
    }),
    expect.objectContaining({
      id: roleplayPreset.id,
      source_id: "github-42",
      tags: ["support-roleplay"],
      metadata_policy: expect.objectContaining({
        summary: {
          mode: "manual",
          note: "Trusted Tavernary editor selection.",
        },
      }),
    }),
    expect.objectContaining({
      id: reasoningPreset.id,
      source_id: "github-42",
      tags: ["guide-reasoning"],
      metadata_policy: expect.objectContaining({
        tags: {
          mode: "manual",
          note: "Verified repository owner selection.",
        },
      }),
    }),
  ]);
});

test("rejects duplicate legacy project IDs before planning paths", () => {
  const duplicate = project("card-a", 42, "published");

  expect(() =>
    planSourceRegistryMigration({
      projects: [duplicate, structuredClone(duplicate)],
      snapshots: [],
      refreshManifest: { schema_version: 2, project_timings: [] },
      metadataByProjectId: { "card-a": automaticMetadata },
    }),
  ).toThrow("Duplicate legacy project ID: card-a");
});

test("rejects sibling legacy snapshots that would overwrite one source snapshot", () => {
  const first = project("card-a", 42, "published");
  const second = {
    ...project("card-b", 42, "published"),
    source: structuredClone(first.source),
  };

  expect(() =>
    planSourceRegistryMigration({
      projects: [first, second],
      snapshots: [snapshot("card-a", 42), snapshot("card-b", 42)],
      refreshManifest: { schema_version: 2, project_timings: [] },
      metadataByProjectId: {
        "card-a": automaticMetadata,
        "card-b": automaticMetadata,
      },
    }),
  ).toThrow("Duplicate source snapshot: github-42");
});

test("reports every path without writing during a dry run", async () => {
  const calls: string[] = [];
  const plan = {
    counts: {
      projects: 1,
      sources: 1,
      snapshots: 0,
      delistedSources: 0,
    },
    projects: [],
    sources: [],
    snapshots: [],
    refreshManifest: {},
    operations: [
      {
        kind: "create" as const,
        path: "data/registry/sources/github-42.json",
        value: { id: "github-42" },
      },
      {
        kind: "update" as const,
        path: "data/registry/projects/card-a.json",
        value: { id: "card-a" },
      },
      {
        kind: "delete" as const,
        path: "data/snapshots/github/card-a.json",
      },
    ],
  };

  const report = await writeSourceRegistryMigration(plan, {
    root: "C:\\fixture",
    write: false,
    writeFile: async () => {
      calls.push("write");
    },
    rename: async () => {
      calls.push("rename");
    },
  });

  expect(calls).toEqual([]);
  expect(report).toMatchObject({
    written: false,
    paths: plan.operations.map(({ path }) => path),
  });
});

test("writes a contained source-first migration and retires old snapshot paths last", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-source-migration-"));
  try {
    await Promise.all([
      mkdir(resolve(root, "data/registry/projects"), { recursive: true }),
      mkdir(resolve(root, "data/registry/sources"), { recursive: true }),
      mkdir(resolve(root, "data/snapshots/github"), { recursive: true }),
    ]);
    const projectPath = resolve(root, "data/registry/projects/card-a.json");
    const oldSnapshotPath = resolve(root, "data/snapshots/github/card-a.json");
    const manifestPath = resolve(root, "data/snapshots/github-refresh.json");
    await Promise.all([
      fsWriteFile(projectPath, '{"schema_version":5}\n'),
      fsWriteFile(oldSnapshotPath, '{"schema_version":3}\n'),
      fsWriteFile(manifestPath, '{"schema_version":2}\n'),
    ]);
    const plan: SourceMigrationPlan = {
      counts: {
        projects: 1,
        sources: 1,
        snapshots: 1,
        delistedSources: 0,
      },
      projects: [{ schema_version: 6, id: "card-a" }],
      sources: [
        {
          schema_version: 1,
          id: "github-42",
          type: "github",
          repository: "owner/repo",
          repository_id: 42,
          status: "active",
          status_reason: null,
          refresh_policy: "automatic",
        },
      ],
      snapshots: [{ schema_version: 4, source_id: "github-42" }],
      refreshManifest: { schema_version: 3 },
      operations: [
        {
          kind: "create",
          path: "data/registry/sources/github-42.json",
          value: {
            schema_version: 1,
            id: "github-42",
            type: "github",
          },
        },
        {
          kind: "update",
          path: "data/registry/projects/card-a.json",
          value: { schema_version: 6, id: "card-a" },
        },
        {
          kind: "create",
          path: "data/snapshots/github/github-42.json",
          value: { schema_version: 4, source_id: "github-42" },
        },
        {
          kind: "delete",
          path: "data/snapshots/github/card-a.json",
        },
        {
          kind: "update",
          path: "data/snapshots/github-refresh.json",
          value: { schema_version: 3 },
        },
      ],
    };
    const writes: string[] = [];
    const renames: Array<[string, string]> = [];
    let validated = false;

    const report = await writeSourceRegistryMigration(plan, {
      root,
      write: true,
      validatePlan: async () => {
        validated = true;
      },
      writeFile: async (path, content) => {
        writes.push(path);
        await fsWriteFile(path, content, "utf8");
      },
      rename: async (from, to) => {
        expect(validated).toBe(true);
        renames.push([from, to]);
        await fsRename(from, to);
      },
    });

    expect(report.written).toBe(true);
    expect(writes.findIndex((path) => path.includes("sources"))).toBeLessThan(
      writes.findIndex((path) => path.includes("projects")),
    );
    expect(JSON.parse(await readFile(projectPath, "utf8"))).toMatchObject({
      schema_version: 6,
      id: "card-a",
    });
    await expect(access(oldSnapshotPath)).rejects.toThrow();
    expect(
      JSON.parse(
        await readFile(
          resolve(root, "data/snapshots/github/github-42.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ schema_version: 4, source_id: "github-42" });
    expect(renames.at(-1)?.[0]).toContain("card-a.json");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rolls back temporary files without changing version-five inputs after a write failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-source-rollback-"));
  try {
    const projectsDirectory = resolve(root, "data/registry/projects");
    const sourcesDirectory = resolve(root, "data/registry/sources");
    const snapshotsDirectory = resolve(root, "data/snapshots/github");
    await Promise.all([
      mkdir(projectsDirectory, { recursive: true }),
      mkdir(sourcesDirectory, { recursive: true }),
      mkdir(snapshotsDirectory, { recursive: true }),
    ]);
    const projectPath = resolve(projectsDirectory, "card-a.json");
    const snapshotPath = resolve(snapshotsDirectory, "card-a.json");
    const originalProject = '{"schema_version":5,"id":"card-a"}\n';
    const originalSnapshot = '{"schema_version":3,"project_id":"card-a"}\n';
    await Promise.all([
      fsWriteFile(projectPath, originalProject),
      fsWriteFile(snapshotPath, originalSnapshot),
    ]);
    const plan: SourceMigrationPlan = {
      counts: {
        projects: 1,
        sources: 1,
        snapshots: 1,
        delistedSources: 0,
      },
      projects: [],
      sources: [],
      snapshots: [],
      refreshManifest: {},
      operations: [
        {
          kind: "create",
          path: "data/registry/sources/github-42.json",
          value: { schema_version: 1, id: "github-42" },
        },
        {
          kind: "update",
          path: "data/registry/projects/card-a.json",
          value: { schema_version: 6, id: "card-a" },
        },
        {
          kind: "delete",
          path: "data/snapshots/github/card-a.json",
        },
      ],
    };
    let writes = 0;

    await expect(
      writeSourceRegistryMigration(plan, {
        root,
        write: true,
        writeFile: async (path, content) => {
          writes += 1;
          await fsWriteFile(path, content, "utf8");
          if (writes === 2) {
            throw new Error("injected write failure");
          }
        },
      }),
    ).rejects.toThrow("injected write failure");

    expect(await readFile(projectPath, "utf8")).toBe(originalProject);
    expect(await readFile(snapshotPath, "utf8")).toBe(originalSnapshot);
    await expect(
      access(resolve(sourcesDirectory, "github-42.json")),
    ).rejects.toThrow();
    const remainingNames = (
      await Promise.all([
        readdir(projectsDirectory),
        readdir(sourcesDirectory),
        readdir(snapshotsDirectory),
      ])
    ).flat();
    expect(
      remainingNames.filter((name) => name.includes(".source-migration-")),
    ).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
