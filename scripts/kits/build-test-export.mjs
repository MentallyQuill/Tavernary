import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildCatalog } from "../catalog/build.mjs";

const fixtureDirectory = resolve("tests/fixtures/kits");

async function readJson(name) {
  return JSON.parse(
    await readFile(resolve(fixtureDirectory, `${name}.json`), "utf8"),
  );
}

function projectRecord(descriptor, index) {
  const visibility = descriptor.visibility ?? "published";
  return {
    schema_version: 6,
    id: descriptor.id,
    source_id: `github-${10_000 + index}`,
    name: descriptor.name,
    kind: descriptor.kind,
    summary: `${descriptor.name} is deterministic Kit fixture project ${index + 1}.`,
    metadata_status: "curated",
    frontends: ["sillytavern"],
    primary_function: descriptor.primary_function,
    tags: [],
    cataloged_at: "2026-07-01T00:00:00.000Z",
    catalog_cohort: "standard",
    listing_status: visibility === "published" ? "active" : "retired",
    listing_status_reason:
      visibility === "published"
        ? null
        : (descriptor.visibility_reason ?? "owner-request"),
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
  };
}

function sourceRecord(descriptor, index) {
  return {
    schema_version: 1,
    id: `github-${10_000 + index}`,
    type: "github",
    repository: `fixture/${descriptor.id}`,
    repository_id: 10_000 + index,
    status: "active",
    status_reason: null,
    refresh_policy: "automatic",
  };
}

function waitForExit(child) {
  return new Promise((resolveExit) => {
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

async function buildFixtureExport() {
  const [projectDescriptors, kitRecords, kitSnapshots, blockedUsers] =
    await Promise.all([
      readJson("projects"),
      readJson("records"),
      readJson("support"),
      readJson("blocked-users"),
    ]);
  const records = projectDescriptors.map(projectRecord);
  const sources = projectDescriptors.map(sourceRecord);
  await buildCatalog({
    write: true,
    now: "2026-07-24T12:00:00.000Z",
    records,
    sources,
    snapshots: [],
    kitRecords,
    kitSnapshots,
    blockedUsers,
  });
  const next = spawn(
    process.execPath,
    [resolve("node_modules/next/dist/bin/next"), "build"],
    { stdio: "inherit", env: process.env },
  );
  const exitCode = await waitForExit(next);
  if (exitCode !== 0) {
    throw new Error(`Fixture Next build exited with ${exitCode}`);
  }
}

let buildError;
try {
  await buildFixtureExport();
} catch (error) {
  buildError = error;
} finally {
  try {
    await buildCatalog({ write: true });
  } catch (restoreError) {
    throw new AggregateError(
      [buildError, restoreError].filter(Boolean),
      "Kit fixture build or production catalog restoration failed",
    );
  }
}
if (buildError) throw buildError;
