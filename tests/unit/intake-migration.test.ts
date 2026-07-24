import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  migrateIntake,
  provisionalSummary,
} from "../../scripts/catalog/intake-migration.mjs";
import { runIntakeMigration } from "../../scripts/catalog/migrate-intake.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await import("node:fs/promises").then(({ rm }) =>
        rm(directory, { recursive: true, force: true }),
      );
    }),
  );
});

describe("intake migration", () => {
  test("builds the exact provisional GitHub extension record", () => {
    const result = migrateIntake({
      intake: [
        {
          id: "samueras-guidedgenerations-extension",
          name: "Guided Generations Extension",
          repository: {
            owner: "Samueras",
            name: "GuidedGenerations-Extension",
            url: "https://github.com/Samueras/GuidedGenerations-Extension/",
          },
          frontends: ["SillyTavern"],
          status: "candidate",
          submission: "user-submitted",
          submitted_at: "2026-07-23",
        },
      ],
      existingRecords: [],
    });

    expect(result.expectedRecords).toEqual([
      {
        schema_version: 2,
        id: "samueras-guidedgenerations-extension",
        name: "Guided Generations Extension",
        kind: "extension",
        summary: "An extension for SillyTavern.",
        metadata_status: "provisional",
        source: {
          type: "github",
          repository: "Samueras/GuidedGenerations-Extension",
          repository_id: null,
        },
        frontends: ["sillytavern"],
        primary_function: "uncategorized",
        capabilities: [],
        cataloged_at: "2026-07-23T00:00:00Z",
        catalog_cohort: "seed",
        visibility: "published",
        refresh_policy: "automatic",
      },
    ]);
    expect(result.recordsToWrite).toEqual(result.expectedRecords);
    expect(result.report.generated_records).toBe(1);
    expect(result.report.writes_required).toBe(1);
  });

  test("builds deterministic grammatical summaries", () => {
    expect(provisionalSummary("Recursion", "extension", ["sillytavern"])).toBe(
      "An extension for SillyTavern.",
    );
    expect(provisionalSummary("Pura's Director", "preset", ["sillytavern"])).toBe(
      "A System Preset for SillyTavern.",
    );
    expect(provisionalSummary("Sonder Engine", "frontend", ["sonder-engine"])).toBe(
      "A frontend for Sonder Engine.",
    );
  });

  test("builds the exact prompt URL preset record", () => {
    const result = migrateIntake({
      intake: [
        {
          id: "puras-director-v15",
          name: "Pura's Director v15.0",
          source_url: "https://platberlitz.github.io/",
          tags: ["Presets"],
          frontends: ["SillyTavern"],
          submitted_at: "2026-07-23",
        },
      ],
      existingRecords: [],
    });

    expect(result.expectedRecords).toEqual([
      {
        schema_version: 2,
        id: "puras-director-v15",
        name: "Pura's Director v15.0",
        kind: "preset",
        summary: "A System Preset for SillyTavern.",
        metadata_status: "provisional",
        source: {
          type: "url",
          url: "https://platberlitz.github.io",
          published_at: null,
          version: null,
          artifact_size_bytes: null,
          license_status: "pending",
          license_spdx_id: null,
        },
        frontends: ["sillytavern"],
        primary_function: "uncategorized",
        capabilities: [],
        cataloged_at: "2026-07-23T00:00:00Z",
        catalog_cohort: "seed",
        visibility: "published",
        refresh_policy: "paused",
      },
    ]);
    expect(result.report.by_source).toEqual({
      github: 0,
      "github-organization": 0,
      url: 1,
    });
    expect(result.report.normalized_source_changes).toBe(1);
  });

  test("treats curated records as authoritative and reuses matching provisional records", () => {
    const curated = {
      schema_version: 2,
      id: "mentallyquill-recursion",
      name: "Recursion",
      kind: "extension",
      summary: "Curated summary.",
      metadata_status: "curated",
      source: {
        type: "github",
        repository: "MentallyQuill/Recursion",
        repository_id: 123,
      },
      frontends: ["sillytavern"],
      primary_function: "generation-reasoning",
      capabilities: ["planning-reasoning"],
      cataloged_at: "2026-07-23T00:00:00Z",
      catalog_cohort: "seed",
      visibility: "published",
      refresh_policy: "automatic",
    };
    const provisional = {
      schema_version: 2,
      id: "samueras-guidedgenerations-extension",
      name: "Guided Generations Extension",
      kind: "extension",
      summary: "An extension for SillyTavern.",
      metadata_status: "provisional",
      source: {
        type: "github",
        repository: "Samueras/GuidedGenerations-Extension",
        repository_id: null,
      },
      frontends: ["sillytavern"],
      primary_function: "uncategorized",
      capabilities: [],
      cataloged_at: "2026-07-23T00:00:00Z",
      catalog_cohort: "seed",
      visibility: "published",
      refresh_policy: "automatic",
    };

    const result = migrateIntake({
      intake: [
        {
          id: "mentallyquill-recursion",
          name: "Recursion",
          repository: {
            owner: "MentallyQuill",
            name: "Recursion",
            url: "https://github.com/MentallyQuill/Recursion",
          },
          frontends: ["SillyTavern"],
          submitted_at: "2026-07-23",
        },
        {
          id: "samueras-guidedgenerations-extension",
          name: "Guided Generations Extension",
          repository: {
            owner: "Samueras",
            name: "GuidedGenerations-Extension",
            url: "https://github.com/Samueras/GuidedGenerations-Extension/",
          },
          frontends: ["SillyTavern"],
          submitted_at: "2026-07-23",
        },
      ],
      existingRecords: [curated, provisional],
    });

    expect(result.expectedRecords).toEqual([provisional]);
    expect(result.recordsToWrite).toEqual([]);
    expect(result.report.curated_overlaps).toBe(1);
    expect(result.report.provisional_matches).toBe(1);
    expect(result.report.writes_required).toBe(0);
    expect(result.report.final_union_records).toBe(2);
  });

  test("fails when an existing provisional record drifts from the deterministic output", () => {
    expect(() =>
      migrateIntake({
        intake: [
          {
            id: "samueras-guidedgenerations-extension",
            name: "Guided Generations Extension",
            repository: {
              owner: "Samueras",
              name: "GuidedGenerations-Extension",
              url: "https://github.com/Samueras/GuidedGenerations-Extension/",
            },
            frontends: ["SillyTavern"],
            submitted_at: "2026-07-23",
          },
        ],
        existingRecords: [
          {
            schema_version: 2,
            id: "samueras-guidedgenerations-extension",
            name: "Guided Generations Extension",
            kind: "extension",
            summary: "Wrong summary.",
            metadata_status: "provisional",
            source: {
              type: "github",
              repository: "Samueras/GuidedGenerations-Extension",
              repository_id: null,
            },
            frontends: ["sillytavern"],
            primary_function: "uncategorized",
            capabilities: [],
            cataloged_at: "2026-07-23T00:00:00Z",
            catalog_cohort: "seed",
            visibility: "published",
            refresh_policy: "automatic",
          },
        ],
      }),
    ).toThrow(
      "Provisional drift: samueras-guidedgenerations-extension",
    );
  });

  test("rejects duplicate intake ids and duplicate normalized canonical sources", () => {
    expect(() =>
      migrateIntake({
        intake: [
          {
            id: "duplicate-id",
            name: "One",
            repository: {
              owner: "Owner",
              name: "Repo",
              url: "https://github.com/Owner/Repo/",
            },
            frontends: ["SillyTavern"],
            submitted_at: "2026-07-23",
          },
          {
            id: "duplicate-id",
            name: "Two",
            repository: {
              owner: "OwnerTwo",
              name: "RepoTwo",
              url: "https://github.com/OwnerTwo/RepoTwo",
            },
            frontends: ["SillyTavern"],
            submitted_at: "2026-07-23",
          },
        ],
        existingRecords: [],
      }),
    ).toThrow("Duplicate intake id: duplicate-id");

    expect(() =>
      migrateIntake({
        intake: [
          {
            id: "one",
            name: "One",
            repository: {
              owner: "Owner",
              name: "Repo",
              url: "https://github.com/Owner/Repo/",
            },
            frontends: ["SillyTavern"],
            submitted_at: "2026-07-23",
          },
          {
            id: "two",
            name: "Two",
            repository: {
              owner: "owner",
              name: "repo",
              url: "https://github.com/owner/repo",
            },
            frontends: ["SillyTavern"],
            submitted_at: "2026-07-23",
          },
        ],
        existingRecords: [],
      }),
    ).toThrow("Duplicate intake canonical source: github:owner/repo");
  });

  test("dry-run does not create project files", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "tavernary-migrate-"));
    temporaryDirectories.push(rootDirectory);
    await mkdir(resolve(rootDirectory, "data/catalog"), { recursive: true });
    await mkdir(resolve(rootDirectory, "data/registry/projects"), {
      recursive: true,
    });
    await mkdir(resolve(rootDirectory, "data/schemas"), { recursive: true });
    await mkdir(resolve(rootDirectory, "data/vocabularies"), {
      recursive: true,
    });
    await writeFile(
      resolve(rootDirectory, "data/catalog/projects.json"),
      `\ufeff${JSON.stringify([
        {
          id: "samueras-guidedgenerations-extension",
          name: "Guided Generations Extension",
          repository: {
            owner: "Samueras",
            name: "GuidedGenerations-Extension",
            url: "https://github.com/Samueras/GuidedGenerations-Extension/",
          },
          frontends: ["SillyTavern"],
          submitted_at: "2026-07-23",
        },
      ])}\n`,
    );

    const workspaceRoot = resolve(process.cwd());
    for (const relativePath of [
      "data/schemas/project.schema.json",
      "data/schemas/repository-snapshot.schema.json",
      "data/vocabularies/frontends.json",
      "data/vocabularies/primary-functions.json",
      "data/vocabularies/capabilities.json",
    ]) {
      await writeFile(
        resolve(rootDirectory, relativePath),
        await readFile(resolve(workspaceRoot, relativePath), "utf8"),
      );
    }

    const result = await runIntakeMigration({
      rootDirectory,
      write: false,
    });

    expect(result.report.intake_records).toBe(1);
    expect(result.report.generated_records).toBe(1);
    expect(result.report.writes_required).toBe(1);
    expect(
      await readdir(resolve(rootDirectory, "data/registry/projects")),
    ).toEqual([]);
    await expect(
      readFile(resolve(rootDirectory, "data/registry/seed-migration-report.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("write mode is rerun-safe after the first migration", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "tavernary-migrate-"));
    temporaryDirectories.push(rootDirectory);
    await mkdir(resolve(rootDirectory, "data/catalog"), { recursive: true });
    await mkdir(resolve(rootDirectory, "data/registry/projects"), {
      recursive: true,
    });
    await mkdir(resolve(rootDirectory, "data/schemas"), { recursive: true });
    await mkdir(resolve(rootDirectory, "data/vocabularies"), {
      recursive: true,
    });
    await writeFile(
      resolve(rootDirectory, "data/catalog/projects.json"),
      `${JSON.stringify([
        {
          id: "samueras-guidedgenerations-extension",
          name: "Guided Generations Extension",
          repository: {
            owner: "Samueras",
            name: "GuidedGenerations-Extension",
            url: "https://github.com/Samueras/GuidedGenerations-Extension/",
          },
          frontends: ["SillyTavern"],
          submitted_at: "2026-07-23",
        },
      ])}\n`,
    );

    const workspaceRoot = resolve(process.cwd());
    for (const relativePath of [
      "data/schemas/project.schema.json",
      "data/schemas/repository-snapshot.schema.json",
      "data/vocabularies/frontends.json",
      "data/vocabularies/primary-functions.json",
      "data/vocabularies/capabilities.json",
    ]) {
      await writeFile(
        resolve(rootDirectory, relativePath),
        await readFile(resolve(workspaceRoot, relativePath), "utf8"),
      );
    }

    const first = await runIntakeMigration({
      rootDirectory,
      write: true,
    });
    const second = await runIntakeMigration({
      rootDirectory,
      write: true,
    });

    expect(first.report.writes_required).toBe(1);
    expect(second.report.writes_required).toBe(0);
    expect(second.report.provisional_matches).toBe(1);
    expect(second.report.final_union_records).toBe(1);
    expect(
      JSON.parse(
        await readFile(
          resolve(rootDirectory, "data/registry/seed-migration-report.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      writes_required: 0,
      provisional_matches: 1,
      final_union_records: 1,
    });
  });
});
